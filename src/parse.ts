import { parseImports, parseNamespace } from './php';

export interface PhpMethod {
  name: string;
  abstract: boolean;
  modifiers: string[];
  byRef: boolean;
  /** Types et noms de classes remplacés par `classRef(fqcn)`, à résoudre dans le fichier cible. */
  params: string[];
  returnType?: string;
}

export interface PhpClass {
  namespace?: string;
  imports: Map<string, string>;
  kind: 'class' | 'interface' | 'trait' | 'enum';
  name: string;
  parents: string[];
  interfaces: string[];
  traits: string[];
  methods: PhpMethod[];
  declarationStart: number;
  bodyStart: number;
  bodyEnd: number;
}

const BUILTIN_TYPES = new Set(
  'int float string bool array callable iterable object mixed void null never false true self static parent'.split(' '),
);
const REF = '\u0000';
export const classRef = (fqcn: string): string => `${REF}${fqcn}${REF}`;
export const CLASS_REF_PATTERN = new RegExp(`${REF}([^${REF}]+)${REF}`, 'g');

/** Remplace le contenu des commentaires, chaînes et heredocs par des espaces, offsets et lignes préservés. */
export function maskNonCode(text: string): string {
  const out = text.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if ((c === '/' && next === '/') || (c === '#' && next !== '[')) {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      blank(i + 1, Math.min(j, text.length));
      i = j + 1;
    } else if (text.startsWith('<<<', i)) {
      const open = /^<<<[ \t]*(['"]?)(\w+)\1\r?\n/.exec(text.slice(i, i + 200));
      if (!open) {
        i += 3;
        continue;
      }
      const bodyStart = i + open[0].length;
      const close = new RegExp(`(^|\\n)[ \\t]*${open[2]}\\b`).exec(text.slice(bodyStart));
      const bodyEnd = close ? bodyStart + close.index : text.length;
      blank(bodyStart, bodyEnd);
      i = close ? bodyEnd + close[0].length : text.length;
    } else {
      i++;
    }
  }
  return out.join('');
}

export function matchingBracket(masked: string, openIndex: number): number {
  const open = masked[openIndex];
  const close = ({ '{': '}', '(': ')', '[': ']' } as Record<string, string>)[open];
  let depth = 0;
  for (let i = openIndex; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close && --depth === 0) return i;
  }
  return -1;
}

export function resolveClassName(name: string, namespace: string | undefined, imports: ReadonlyMap<string, string>): string {
  if (name.startsWith('\\')) return name.slice(1);
  const [first, ...rest] = name.split('\\');
  const imported = imports.get(first);
  if (imported) return [imported, ...rest].join('\\');
  return namespace ? `${namespace}\\${name}` : name;
}

const nameList = (s: string | undefined): string[] =>
  (s ?? '').split(',').map((n) => n.trim()).filter(Boolean);

export function parsePhpClass(text: string): PhpClass | undefined {
  const masked = maskNonCode(text);
  const declaration =
    /(?<!(?:::|\bnew)\s*)\b((?:(?:abstract|final|readonly)\s+)*)(class|interface|trait|enum)\s+(\w+)([^{;]*)\{/.exec(masked);
  if (!declaration) return undefined;

  const namespace = parseNamespace(masked);
  const imports = parseImports(masked);
  const resolve = (name: string) => resolveClassName(name, namespace, imports);
  const kind = declaration[2] as PhpClass['kind'];
  const header = declaration[4];
  const extended = nameList(/\bextends\s+([\w\\\s,]+?)\s*(?=\bimplements\b|$)/.exec(header)?.[1]).map(resolve);
  const implemented = nameList(/\bimplements\s+([\w\\\s,]+)/.exec(header)?.[1]).map(resolve);

  const bodyStart = declaration.index + declaration[0].length - 1;
  const bodyEnd = matchingBracket(masked, bodyStart);
  if (bodyEnd < 0) return undefined;

  const offset = bodyStart + 1;
  const flat = flattenNestedBlocks(masked.slice(offset, bodyEnd));
  const original = text.slice(offset, bodyEnd);

  const traits = [...flat.matchAll(/\buse\s+([\w\\\s,]+?)\s*[;{]/g)].flatMap((m) => nameList(m[1]).map(resolve));
  const methods: PhpMethod[] = [];
  for (const m of flat.matchAll(/((?:\b(?:abstract|final|public|protected|private|static)\s+)*)\bfunction\s+(&\s*)?(\w+)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchingBracket(flat, open);
    if (close < 0) continue;
    const terminator = /[;{]/.exec(flat.slice(close + 1));
    const tail = original.slice(close + 1, close + 1 + (terminator?.index ?? 0)).trim();
    const modifiers = m[1].trim().split(/\s+/).filter(Boolean);
    methods.push({
      name: m[3],
      abstract: kind === 'interface' || modifiers.includes('abstract'),
      modifiers,
      byRef: Boolean(m[2]),
      params: splitTopLevel(original.slice(open + 1, close), flat.slice(open + 1, close)).map(([o, k]) => canonicalParam(o, k, resolve)),
      returnType: tail.startsWith(':') ? canonicalType(tail.slice(1).trim(), resolve) : undefined,
    });
  }

  return {
    namespace,
    imports,
    kind,
    name: declaration[3],
    parents: kind === 'interface' ? [] : extended,
    interfaces: kind === 'interface' ? extended : implemented,
    traits,
    methods,
    declarationStart: declaration.index,
    bodyStart,
    bodyEnd,
  };
}

function flattenNestedBlocks(masked: string): string {
  let depth = 0;
  return masked.replace(/[{}]|[^{}]/g, (c) => {
    if (c === '{') return depth++ === 0 ? c : ' ';
    if (c === '}') return --depth === 0 ? c : ' ';
    return depth > 0 && c !== '\n' ? ' ' : c;
  });
}

function splitTopLevel(original: string, masked: string): [string, string][] {
  const parts: [string, string][] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= masked.length; i++) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if ((c === ',' && depth === 0) || i === masked.length) {
      if (masked.slice(start, i).trim()) parts.push([original.slice(start, i), masked.slice(start, i)]);
      start = i + 1;
    }
  }
  return parts;
}

function canonicalType(type: string, resolve: (name: string) => string): string {
  return type.replace(/\\?[A-Za-z_][\w\\]*/g, (name) => (BUILTIN_TYPES.has(name.toLowerCase()) ? name : classRef(resolve(name))));
}

function canonicalParam(original: string, masked: string, resolve: (name: string) => string): string {
  for (const attribute of [...masked.matchAll(/#\[/g)].reverse()) {
    const end = matchingBracket(masked, attribute.index + 1) + 1;
    original = original.slice(0, attribute.index) + original.slice(end);
    masked = masked.slice(0, attribute.index) + masked.slice(end);
  }
  const variable = masked.indexOf('$');
  const typeEnd = variable - (/(&\s*)?(\.\.\.\s*)?$/.exec(masked.slice(0, variable))?.[0].length ?? 0);
  const type = original.slice(0, typeEnd).replace(/\b(?:public|protected|private|readonly)\s+/g, '').trim();
  const rest = original
    .slice(typeEnd)
    .replace(/(?<![\w\\$])(\\?[A-Za-z_][\w\\]*)(?=\s*::)/g, (name) => (BUILTIN_TYPES.has(name.toLowerCase()) ? name : classRef(resolve(name))))
    .replace(/(?<=\bnew\s+)(\\?[A-Za-z_][\w\\]*)/g, (name) => classRef(resolve(name)))
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();
  return type ? `${canonicalType(type, resolve)} ${rest}` : rest;
}
