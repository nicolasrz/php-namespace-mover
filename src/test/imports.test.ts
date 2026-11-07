import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LineEdit, lineEdits } from '../diff';
import { removeUnusedImports } from '../imports';

const php = (...lines: string[]) => lines.join('\n');

test('supprime les imports inutilisés, garde ceux du code et des docblocks', () => {
  const before = php(
    '<?php',
    '',
    'namespace App\\Controller;',
    '',
    'use App\\Entity\\User;',
    'use App\\Entity\\Unused;',
    'use App\\Repository\\UserRepository as Repo;',
    'use Doctrine\\ORM\\EntityManagerInterface;',
    'use Symfony\\Component\\HttpFoundation\\Response;',
    'use App\\Exception\\NotFound;',
    'use App\\Entity;',
    '',
    'final class UserController',
    '{',
    '    use SomeTrait;',
    '',
    '    /** @throws NotFound */',
    '    public function show(Repo $repo, Entity\\Post $post): Response',
    '    {',
    "        // Unused dans un commentaire, 'EntityManagerInterface' dans une chaîne",
    '        return new Response($this->User . User::class);',
    '    }',
    '}',
  );
  const { text, removed } = removeUnusedImports(before);
  assert.deepEqual(removed, ['App\\Entity\\Unused', 'Doctrine\\ORM\\EntityManagerInterface']);
  assert.equal(
    text,
    before.replace('use App\\Entity\\Unused;\n', '').replace('use Doctrine\\ORM\\EntityManagerInterface;\n', ''),
  );
});

test('tous inutilisés : le bloc disparaît sans laisser de double ligne vide', () => {
  const before = php('<?php', '', 'namespace App;', '', 'use A\\B;', 'use C\\D; // commentaire', '', 'class X {}');
  assert.equal(removeUnusedImports(before).text, php('<?php', '', 'namespace App;', '', 'class X {}'));
});

test('use groupés, listes, function et const', () => {
  const before = php(
    '<?php',
    'namespace App;',
    'use App\\Model\\{User, Post, Tag as Label};',
    'use App\\A, App\\B;',
    'use function App\\helper, App\\unusedHelper;',
    'use const App\\VERSION;',
    'class X { function f(User $u, Label $l, B $b) { return helper(VERSION); } }',
  );
  assert.equal(
    removeUnusedImports(before).text,
    php(
      '<?php',
      'namespace App;',
      'use App\\Model\\{User, Tag as Label};',
      'use App\\B;',
      'use function App\\helper;',
      'use const App\\VERSION;',
      'class X { function f(User $u, Label $l, B $b) { return helper(VERSION); } }',
    ),
  );
});

test('rien à faire quand tout est utilisé', () => {
  const before = php('<?php', 'namespace App;', 'use A\\B;', 'class X extends B {}');
  assert.deepEqual(removeUnusedImports(before), { text: before, removed: [] });
});

const apply = (text: string, edits: LineEdit[]) => {
  const lines = text.split('\n');
  const offset = (line: number, ch: number) => lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + ch;
  return [...edits]
    .reverse()
    .reduce((t, e) => t.slice(0, offset(e.startLine, e.startCharacter)) + e.text + t.slice(offset(e.endLine, e.endCharacter)), text);
};

test('lineEdits : suppressions ciblées, y compris en fin de fichier', () => {
  const before = php('a', '', 'x', 'y', '', 'b', 'c', 'z');
  const after = php('a', '', 'b', 'C');
  const edits = lineEdits(before, after);
  assert.equal(apply(before, edits), after);
  assert.ok(edits.every((e) => e.text === '' || e.text === 'C'));
});
