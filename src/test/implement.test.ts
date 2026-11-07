import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { createClassLocator } from '../autoload';
import { builtinClassSource } from '../builtins';
import { implementMissingMethods } from '../implement';
import { maskNonCode } from '../parse';

const php = (...lines: string[]) => lines.join('\n');
const BODY = "throw new \\LogicException('Not implemented.');";
const reader = (classes: Record<string, string>) => (fqcn: string) => classes[fqcn] ?? builtinClassSource(fqcn);

const repository = php(
  '<?php',
  'namespace App\\Domain;',
  'use App\\Domain\\Model\\User;',
  'use Doctrine\\Common\\Collections\\Collection as Coll;',
  '',
  'interface UserRepository extends \\Countable',
  '{',
  '    /** @return User|null  ne pas confondre : function fake(); */',
  '    public function find(int $id, #[\\SensitiveParameter] ?string $label = null): ?User;',
  '',
  '    public function all(',
  '        array $filters = [],',
  '        string $sep = ",",',
  '        int $mode = self::MODE,',
  '    ): Coll;',
  '',
  '    public static function create(User ...$users): static;',
  '}',
);

test('interface avec types importés, defaults et interface native héritée', () => {
  const target = php(
    '<?php',
    '',
    'namespace App\\Infra;',
    '',
    'use App\\Domain\\UserRepository;',
    '',
    'final class DoctrineUserRepository implements UserRepository',
    '{',
    '    private array $cache = [];',
    '}',
  );
  const result = implementMissingMethods(target, reader({ 'App\\Domain\\UserRepository': repository }), BODY);
  assert.deepEqual(result?.unresolved, []);
  assert.equal(
    result?.text,
    php(
      '<?php',
      '',
      'namespace App\\Infra;',
      '',
      'use App\\Domain\\Model\\User;',
      'use App\\Domain\\UserRepository;',
      'use Doctrine\\Common\\Collections\\Collection;',
      '',
      'final class DoctrineUserRepository implements UserRepository',
      '{',
      '    private array $cache = [];',
      '',
      '    public function find(int $id, ?string $label = null): ?User',
      '    {',
      `        ${BODY}`,
      '    }',
      '',
      '    public function all(array $filters = [], string $sep = ",", int $mode = self::MODE): Collection',
      '    {',
      `        ${BODY}`,
      '    }',
      '',
      '    public static function create(User ...$users): static',
      '    {',
      `        ${BODY}`,
      '    }',
      '',
      '    public function count(): int',
      '    {',
      `        ${BODY}`,
      '    }',
      '}',
    ),
  );
});

test('classe abstraite : seules les méthodes abstraites manquantes, en tenant compte des traits', () => {
  const base = php(
    '<?php',
    'namespace App;',
    'abstract class Handler implements \\Stringable',
    '{',
    '    abstract protected function handle(Message $m): void;',
    '    abstract public function name(): string;',
    '    public function __toString(): string { return $this->name(); }',
    '}',
  );
  const trait = php('<?php', 'namespace App;', 'trait Named { public function name(): string { return "x"; } }');
  const target = php('<?php', 'namespace App;', 'class MailHandler extends Handler {', '    use Named;', '}');
  const result = implementMissingMethods(target, reader({ 'App\\Handler': base, 'App\\Named': trait }), BODY);
  assert.deepEqual(result?.methods, ['handle']);
  assert.match(result!.text, /    protected function handle\(Message \$m\): void\n    \{/);
  assert.doesNotMatch(result!.text, /^use /m);
});

test('classe vide sur une ligne et interface introuvable signalée', () => {
  const result = implementMissingMethods(
    php('<?php', 'namespace App;', 'class Cart implements \\Countable, Missing {}'),
    reader({}),
    BODY,
  );
  assert.deepEqual(result?.unresolved, ['App\\Missing']);
  assert.equal(result?.text, php('<?php', 'namespace App;', 'class Cart implements \\Countable, Missing {', '    public function count(): int', '    {', `        ${BODY}`, '    }', '}'));
});

test('rien à faire quand tout est déjà implémenté', () => {
  const target = php('<?php', 'namespace App;', 'class Cart implements \\Countable { public function COUNT(): int { return 0; } }');
  assert.deepEqual(implementMissingMethods(target, reader({}), BODY)?.methods, []);
});

test('masquage : commentaires, chaînes et heredoc n\'altèrent ni offsets ni lignes', () => {
  const source = "<?php\n// {\n$a = '}'; $b = <<<EOT\n{ function x(); }\nEOT;\n#[Attr] function y() {}";
  const masked = maskNonCode(source);
  assert.equal(masked.length, source.length);
  assert.equal(masked.split('\n').length, source.split('\n').length);
  assert.doesNotMatch(masked, /function x|\{.*\}.*\n.*EOT;\n$/);
  assert.match(masked, /#\[Attr\] function y\(\) \{\}/);
});

test('autoload : projet, autoload_psr4 et classmap de vendor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prk-'));
  const write = (file: string, content = '<?php') => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  };
  write('composer.json', JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }));
  write('src/Domain/User.php');
  write('vendor/psr/log/src/LoggerInterface.php');
  write('vendor/legacy/Thing.php');
  write('vendor/composer/autoload_psr4.php', "<?php\nreturn array(\n    'Psr\\\\Log\\\\' => array($vendorDir . '/psr/log/src'),\n);\n");
  write('vendor/composer/autoload_classmap.php', "<?php\nreturn array(\n    'Legacy_Thing' => $vendorDir . '/legacy/Thing.php',\n);\n");

  const locate = createClassLocator(path.join(dir, 'composer.json'));
  assert.equal(locate('App\\Domain\\User'), path.join(dir, 'src/Domain/User.php'));
  assert.equal(locate('Psr\\Log\\LoggerInterface'), path.join(dir, 'vendor/psr/log/src/LoggerInterface.php'));
  assert.equal(locate('Legacy_Thing'), path.join(dir, 'vendor/legacy/Thing.php'));
  assert.equal(locate('App\\Nope'), undefined);
});
