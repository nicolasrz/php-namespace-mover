export interface LineEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
}

/**
 * Les réécritures modifient des lignes et soit en insèrent, soit en suppriment : un alignement glouton
 * suffit et produit des edits ciblés, ce qui préserve curseur et sélection dans les éditeurs ouverts.
 */
export function lineEdits(before: string, after: string): LineEdit[] {
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const last = a.length - 1;
  const endOfDocument = { endLine: last, endCharacter: a[last].length };

  let insertions = Math.max(0, b.length - a.length);
  let deletions = Math.max(0, a.length - b.length);
  const edits: LineEdit[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j === b.length) {
      if (i === 0) return [{ startLine: 0, startCharacter: 0, ...endOfDocument, text: after }];
      edits.push({ startLine: i - 1, startCharacter: a[i - 1].length, ...endOfDocument, text: '' });
      break;
    }
    if (i === a.length) {
      edits.push({ startLine: last, startCharacter: a[last].length, ...endOfDocument, text: eol + b.slice(j).join(eol) });
      break;
    }
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    const inserted = insertions ? b.slice(j + 1, j + 1 + insertions).indexOf(a[i]) + 1 : 0;
    if (inserted > 0) {
      edits.push({ startLine: i, startCharacter: 0, endLine: i, endCharacter: 0, text: b.slice(j, j + inserted).map((l) => l + eol).join('') });
      j += inserted;
      insertions -= inserted;
      continue;
    }
    const deleted = deletions ? a.slice(i + 1, i + 1 + deletions).indexOf(b[j]) + 1 : 0;
    if (deleted > 0) {
      edits.push({ startLine: i, startCharacter: 0, endLine: i + deleted, endCharacter: 0, text: '' });
      i += deleted;
      deletions -= deleted;
      continue;
    }
    edits.push({ startLine: i, startCharacter: 0, endLine: i, endCharacter: a[i].length, text: b[j] });
    i++;
    j++;
  }
  return edits;
}
