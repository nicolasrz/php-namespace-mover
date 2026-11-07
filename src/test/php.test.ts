import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { namespaceForDirectory, readPsr4Roots } from '../composer';
import { LineEdit, lineEdits } from '../diff';
import { ClassMove, replaceFqcnReferences, rewriteFile } from '../php';

const php = (...lines: string[]) => lines.join('\n');

const index = new Map([
  ['App\\Service', new Set(['Mailer', 'Logger', 'Notifier'])],
  ['App\\Infra', new Set(['Client'])],
]);

const mailerMove: ClassMove = { oldFqcn: 'App\\Service\\Mailer', newFqcn: 'App\\Infra\\Mail\\Mailer' };

test('composer : namespace PSR-4 du dossier cible', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnm-'));
  fs.writeFileSync(
    path.join(dir, 'composer.json'),
    JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } }, 'autoload-dev': { 'psr-4': { 'App\\Tests\\': ['tests/'] } } }),
  );
  const roots = readPsr4Roots(path.join(dir, 'composer.json'));
  assert.equal(namespaceForDirectory(path.join(dir, 'src', 'Domain', 'User'), roots), 'App\\Domain\\User');
  assert.equal(namespaceForDirectory(path.join(dir, 'src'), roots), 'App');
  assert.equal(namespaceForDirectory(path.join(dir, 'tests', 'Unit'), roots), 'App\\Tests\\Unit');
  assert.equal(namespaceForDirectory(path.join(dir, 'bin'), roots), undefined);
  assert.equal(namespaceForDirectory(path.join(dir, 'src', 'my-dir'), roots), undefined);
});

test('fichier déplacé : namespace mis à jour et import des anciens voisins', () => {
  const before = php(
    '<?php',
    '',
    'namespace App\\Service;',
    '',
    'use Psr\\Log\\LoggerInterface;',
    '',
    'final class Mailer',
    '{',
    '    public function __construct(private Logger $logger, private LoggerInterface $psr) {}',
    '}',
  );
  assert.equal(
    rewriteFile(before, mailerMove, [mailerMove], index),
    php(
      '<?php',
      '',
      'namespace App\\Infra\\Mail;',
      '',
      'use App\\Service\\Logger;',
      'use Psr\\Log\\LoggerInterface;',
      '',
      'final class Mailer',
      '{',
      '    public function __construct(private Logger $logger, private LoggerInterface $psr) {}',
      '}',
    ),
  );
});

test('fichier tiers : use et FQCN mis à jour', () => {
  const before = php(
    '<?php',
    'namespace App\\Controller;',
    'use App\\Service\\Mailer;',
    'use App\\Service\\MailerFactory;',
    '$a = \\App\\Service\\Mailer::class;',
  );
  assert.equal(
    rewriteFile(before, undefined, [mailerMove], index),
    php(
      '<?php',
      'namespace App\\Controller;',
      'use App\\Infra\\Mail\\Mailer;',
      'use App\\Service\\MailerFactory;',
      '$a = \\App\\Infra\\Mail\\Mailer::class;',
    ),
  );
});

test('voisin resté dans l\'ancien namespace : ajout du use', () => {
  const before = php('<?php', '', 'namespace App\\Service;', '', 'class Notifier', '{', '    public function __construct(Mailer $mailer) {}', '}');
  assert.equal(
    rewriteFile(before, undefined, [mailerMove], index),
    php('<?php', '', 'namespace App\\Service;', '', 'use App\\Infra\\Mail\\Mailer;', '', 'class Notifier', '{', '    public function __construct(Mailer $mailer) {}', '}'),
  );
});

test('pas d\'import pour une variable, une propriété ou une constante homonyme', () => {
  const before = php('<?php', 'namespace App\\Service;', 'class Notifier { function f() { return $this->Mailer . self::Mailer . $Mailer; } }');
  assert.equal(rewriteFile(before, undefined, [mailerMove], index), before);
});

test('renommage de classe : déclaration et usages importés', () => {
  const rename: ClassMove = { oldFqcn: 'App\\Service\\Mailer', newFqcn: 'App\\Service\\Sender' };
  assert.equal(
    rewriteFile(php('<?php', 'namespace App\\Service;', 'class Mailer { static function make(): Mailer { return new Mailer(); } }'), rename, [rename], index),
    php('<?php', 'namespace App\\Service;', 'class Sender { static function make(): Sender { return new Sender(); } }'),
  );
  assert.equal(
    rewriteFile(php('<?php', 'namespace App\\Controller;', 'use App\\Service\\Mailer;', 'function f(Mailer $m) {}'), undefined, [rename], index),
    php('<?php', 'namespace App\\Controller;', 'use App\\Service\\Sender;', 'function f(Sender $m) {}'),
  );
});

test('dossier déplacé en entier : pas d\'import entre classes déplacées ensemble', () => {
  const moves: ClassMove[] = [
    mailerMove,
    { oldFqcn: 'App\\Service\\Logger', newFqcn: 'App\\Infra\\Mail\\Logger' },
    { oldFqcn: 'App\\Service\\Notifier', newFqcn: 'App\\Infra\\Mail\\Notifier' },
  ];
  const before = php('<?php', 'namespace App\\Service;', 'class Mailer { function __construct(Logger $l) {} }');
  assert.equal(rewriteFile(before, moves[0], moves, index), php('<?php', 'namespace App\\Infra\\Mail;', 'class Mailer { function __construct(Logger $l) {} }'));
});

test('YAML : FQCN simple et échappé', () => {
  const yaml = "App\\Service\\Mailer:\n  class: 'App\\\\Service\\\\Mailer'\nApp\\Service\\MailerFactory: ~\n";
  assert.equal(
    replaceFqcnReferences(yaml, [mailerMove]),
    "App\\Infra\\Mail\\Mailer:\n  class: 'App\\\\Infra\\\\Mail\\\\Mailer'\nApp\\Service\\MailerFactory: ~\n",
  );
});

const apply = (text: string, edits: LineEdit[]) => {
  const lines = text.split(/\r?\n/);
  const offset = (line: number, ch: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + ch;
  return [...edits]
    .reverse()
    .reduce((t, e) => t.slice(0, offset(e.startLine, e.startCharacter)) + e.text + t.slice(offset(e.endLine, e.endCharacter)), text);
};

test('lineEdits : edits ciblés qui reproduisent le texte final', () => {
  const before = php('<?php', '', 'namespace A;', '', 'use B;', '', 'class C {}');
  const after = php('<?php', '', 'namespace X;', '', 'use A\\D;', 'use B;', '', 'class C {}');
  const edits = lineEdits(before, after);
  assert.equal(edits.length, 2);
  assert.equal(apply(before, edits), after);
});
