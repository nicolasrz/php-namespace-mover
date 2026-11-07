export interface LineEdit {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  text: string;
}

/**
 * Les réécritures ne font que modifier des lignes ou en insérer : un alignement glouton suffit et
 * produit des edits ciblés, ce qui préserve curseur et sélection dans les éditeurs ouverts.
 */
export function lineEdits(before: string, after: string): LineEdit[] {
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const last = a.length - 1;
  const whole: LineEdit[] = [{ startLine: 0, startCharacter: 0, endLine: last, endCharacter: a[last].length, text: after }];

  let insertions = b.length - a.length;
  if (insertions < 0) return whole;

  const edits: LineEdit[] = [];
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i === a.length) {
      edits.push({ startLine: last, startCharacter: a[last].length, endLine: last, endCharacter: a[last].length, text: eol + b.slice(j).join(eol) });
      return edits;
    }
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    const inserted = b.slice(j + 1, j + 1 + insertions).indexOf(a[i]) + 1;
    if (inserted > 0) {
      edits.push({ startLine: i, startCharacter: 0, endLine: i, endCharacter: 0, text: b.slice(j, j + inserted).map((l) => l + eol).join('') });
      j += inserted;
      insertions -= inserted;
      continue;
    }
    edits.push({ startLine: i, startCharacter: 0, endLine: i, endCharacter: a[i].length, text: b[j] });
    i++;
    j++;
  }
  return i === a.length ? edits : whole;
}
