export interface ClassMove {
  oldFqcn: string;
  newFqcn: string;
}

export const isIdentifier = (s: string): boolean => /^[A-Za-z_\x80-￿][\w\x80-￿]*$/.test(s);

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const doubleBackslashes = (s: string): string => s.replace(/\\/g, '\\\\');

export function splitFqcn(fqcn: string): { namespace: string; name: string } {
  const i = fqcn.lastIndexOf('\\');
  return { namespace: i < 0 ? '' : fqcn.slice(0, i), name: fqcn.slice(i + 1) };
}

export function parseNamespace(text: string): string | undefined {
  return /^[ \t]*namespace\s+([\w\\]+)\s*;/m.exec(text)?.[1];
}

export function parseClassName(text: string): string | undefined {
  return /^[ \t]*(?:(?:final|abstract|readonly)\s+)*(?:class|interface|trait|enum)\s+(\w+)/m.exec(text)?.[1];
}

export function parseImports(text: string): Map<string, string> {
  const imports = new Map<string, string>();
  for (const m of text.matchAll(/^use\s+(?!function\b|const\b)\\?([\w\\]+)(?:\s+as\s+(\w+))?\s*;/gm)) {
    imports.set(m[2] ?? splitFqcn(m[1]).name, m[1]);
  }
  return imports;
}

// Exclut variables, propriétés (->), constantes (::) et segments de namespace.
const shortNamePattern = (name: string): RegExp =>
  new RegExp(`(?<![\\w$\\\\])(?<!->)(?<!::)${escape(name)}(?![\\w\\\\])`, 'g');

export function referencesShortName(text: string, name: string): boolean {
  const body = text.replace(/^[ \t]*(?:use|namespace)\s[^;]*;/gm, '');
  return shortNamePattern(name).test(body);
}

export function renameShortName(text: string, from: string, to: string): string {
  return text.replace(shortNamePattern(from), to);
}

export function replaceFqcnReferences(text: string, moves: readonly ClassMove[]): string {
  for (const { oldFqcn, newFqcn } of moves) {
    text = text
      .replace(new RegExp(`(?<![\\w\\\\])(\\\\?)${escape(oldFqcn)}(?![\\w\\\\])`, 'g'), `$1${newFqcn}`)
      .replace(
        new RegExp(`(?<![\\w\\\\])((?:\\\\\\\\)?)${escape(doubleBackslashes(oldFqcn))}(?![\\w\\\\])`, 'g'),
        `$1${doubleBackslashes(newFqcn)}`,
      );
  }
  return text;
}

export function addImports(text: string, fqcns: readonly string[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  for (const fqcn of [...new Set(fqcns)].sort()) {
    const statement = `use ${fqcn};`;
    const useLines = lines.flatMap((line, i) => (/^use\s[^;]*;\s*$/.test(line) ? [i] : []));
    if (useLines.length) {
      const before = useLines.find((i) => lines[i].toLowerCase() > statement.toLowerCase());
      lines.splice(before ?? useLines[useLines.length - 1] + 1, 0, statement);
    } else {
      const namespaceLine = lines.findIndex((line) => /^[ \t]*namespace\s/.test(line));
      if (namespaceLine < 0) continue;
      lines.splice(namespaceLine + 1, 0, '', statement);
    }
  }
  return lines.join(eol);
}

/**
 * `classesByNamespace` doit refléter l'état d'avant le déplacement : c'est lui qui permet de
 * repérer les classes utilisées sans `use` parce qu'elles partageaient le namespace du fichier.
 */
export function rewriteFile(
  text: string,
  ownMove: ClassMove | undefined,
  moves: readonly ClassMove[],
  classesByNamespace: ReadonlyMap<string, ReadonlySet<string>>,
): string {
  const currentNamespace = parseNamespace(text);
  const ownName = parseClassName(text);
  const imports = parseImports(text);
  const moveByOld = new Map(moves.map((m) => [m.oldFqcn, m]));

  const implicit =
    currentNamespace === undefined
      ? []
      : [...(classesByNamespace.get(currentNamespace) ?? [])]
          .filter((name) => name !== ownName && !imports.has(name) && referencesShortName(text, name))
          .map((name) => `${currentNamespace}\\${name}`);

  let result = replaceFqcnReferences(text, moves);

  if (ownMove) {
    const from = splitFqcn(ownMove.oldFqcn);
    const to = splitFqcn(ownMove.newFqcn);
    result = result.replace(/^([ \t]*namespace\s+)[\w\\]+(\s*;)/m, `$1${to.namespace}$2`);
    if (from.name !== to.name) result = renameShortName(result, from.name, to.name);
  }

  for (const [alias, fqcn] of imports) {
    const move = moveByOld.get(fqcn);
    const from = splitFqcn(fqcn).name;
    const to = move && splitFqcn(move.newFqcn).name;
    if (move && move !== ownMove && alias === from && to !== from) result = renameShortName(result, from, to!);
  }

  const finalNamespace = ownMove ? splitFqcn(ownMove.newFqcn).namespace : currentNamespace;
  const toImport: string[] = [];
  for (const fqcn of implicit) {
    const target = splitFqcn(moveByOld.get(fqcn)?.newFqcn ?? fqcn);
    const from = splitFqcn(fqcn).name;
    if (from !== target.name) result = renameShortName(result, from, target.name);
    if (target.namespace !== finalNamespace) toImport.push(`${target.namespace}\\${target.name}`);
  }

  return toImport.length ? addImports(result, toImport) : result;
}
