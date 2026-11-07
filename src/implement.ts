import { CLASS_REF_PATTERN, maskNonCode, parsePhpClass, PhpClass, PhpMethod } from './parse';
import { addImports, splitFqcn } from './php';

export type ClassReader = (fqcn: string) => string | undefined;

export interface Implementation {
  text: string;
  methods: string[];
  unresolved: string[];
}

export function findMissingMethods(target: PhpClass, read: ClassReader): { methods: PhpMethod[]; unresolved: string[] } {
  const concrete = new Set(target.methods.map((m) => m.name.toLowerCase()));
  const abstract = new Map<string, PhpMethod>();
  const visited = new Set<string>();
  const unresolved: string[] = [];

  const visit = (fqcn: string) => {
    if (visited.has(fqcn.toLowerCase())) return;
    visited.add(fqcn.toLowerCase());
    const source = read(fqcn);
    const parsed = source && parsePhpClass(source);
    if (!parsed) {
      unresolved.push(fqcn);
      return;
    }
    for (const method of parsed.methods) {
      const key = method.name.toLowerCase();
      if (!method.abstract) concrete.add(key);
      else if (!abstract.has(key)) abstract.set(key, method);
    }
    [...parsed.parents, ...parsed.interfaces, ...parsed.traits].forEach(visit);
  };
  [...target.parents, ...target.interfaces, ...target.traits].forEach(visit);

  return { methods: [...abstract.values()].filter((m) => !concrete.has(m.name.toLowerCase())), unresolved };
}

export function implementMissingMethods(text: string, read: ClassReader, body: string): Implementation | undefined {
  const target = parsePhpClass(text);
  if (!target || target.kind === 'interface') return undefined;

  const { methods, unresolved } = findMissingMethods(target, read);
  if (!methods.length) return { text, methods: [], unresolved };

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = detectIndent(text.slice(target.bodyStart + 1, target.bodyEnd));
  const names = new TargetNames(target);
  const stubs = methods.map((m) => renderStub(m, names, indent, body, eol));

  const closing = target.bodyEnd;
  const lineStart = text.lastIndexOf('\n', closing - 1) + 1;
  const ownLine = text.slice(lineStart, closing).trim() === '';
  const hasMembers = maskNonCode(text.slice(target.bodyStart + 1, closing)).trim() !== '';
  const block = stubs.join(eol + eol);
  const result = ownLine
    ? text.slice(0, lineStart) + (hasMembers ? eol : '') + block + eol + text.slice(lineStart)
    : text.slice(0, closing) + eol + block + eol + text.slice(closing);

  return { text: addImports(result, names.added), methods: methods.map((m) => m.name), unresolved };
}

function renderStub(method: PhpMethod, names: TargetNames, indent: string, body: string, eol: string): string {
  const resolve = (s: string) => s.replace(CLASS_REF_PATTERN, (_, fqcn: string) => names.nameFor(fqcn));
  const visibility = method.modifiers.find((m) => ['public', 'protected', 'private'].includes(m)) ?? 'public';
  const modifiers = [visibility, ...(method.modifiers.includes('static') ? ['static'] : [])].join(' ');
  const returnType = method.returnType ? `: ${resolve(method.returnType)}` : '';
  const signature = `${modifiers} function ${method.byRef ? '&' : ''}${method.name}(${method.params.map(resolve).join(', ')})${returnType}`;
  return [`${indent}${signature}`, `${indent}{`, `${indent}${indent}${body}`, `${indent}}`].join(eol);
}

function detectIndent(body: string): string {
  const indents = body.split(/\r?\n/).flatMap((line) => /^([ \t]+)\S/.exec(line)?.[1] ?? []);
  return indents.sort((a, b) => a.length - b.length)[0] ?? '    ';
}

class TargetNames {
  readonly added: string[] = [];
  private readonly imports: Map<string, string>;

  constructor(private readonly target: PhpClass) {
    this.imports = new Map(target.imports);
  }

  nameFor(fqcn: string): string {
    for (const [alias, imported] of this.imports) if (imported.toLowerCase() === fqcn.toLowerCase()) return alias;
    const { namespace, name } = splitFqcn(fqcn);
    if (!this.target.namespace) return namespace ? `\\${fqcn}` : fqcn;
    if (!namespace) return `\\${fqcn}`;
    if (namespace === this.target.namespace && !this.imports.has(name)) return name;
    if (this.imports.has(name) || name === this.target.name) return `\\${fqcn}`;
    this.imports.set(name, fqcn);
    this.added.push(fqcn);
    return name;
  }
}
