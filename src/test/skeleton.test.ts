import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guessKind, phpSkeleton } from '../skeleton';

test('type déduit du nom', () => {
  assert.equal(guessKind('CarnetRepositoryInterface'), 'interface');
  assert.equal(guessKind('TimestampableTrait'), 'trait');
  assert.equal(guessKind('AbstractHandler'), 'abstract class');
  assert.equal(guessKind('Abstraction'), undefined);
  assert.equal(guessKind('Interface'), undefined);
  assert.equal(guessKind('Carnet'), undefined);
});

test('squelette avec namespace et curseur dans le corps', () => {
  const { text, cursor } = phpSkeleton('App\\Domain\\Model', 'Carnet', 'final class', { strictTypes: false, eol: '\n', indent: '    ' });
  assert.equal(text, '<?php\n\nnamespace App\\Domain\\Model;\n\nfinal class Carnet\n{\n    \n}\n');
  assert.deepEqual(cursor, { line: 6, character: 4 });
});

test('squelette avec strict_types', () => {
  const { text, cursor } = phpSkeleton('App', 'Clock', 'interface', { strictTypes: true, eol: '\n', indent: '\t' });
  assert.equal(text, '<?php\n\ndeclare(strict_types=1);\n\nnamespace App;\n\ninterface Clock\n{\n\t\n}\n');
  assert.deepEqual(cursor, { line: 8, character: 1 });
});
