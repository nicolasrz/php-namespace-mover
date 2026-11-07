import { maskNonCode } from './parse';

interface ImportItem {
  text: string;
  alias: string;
}

interface ImportStatement {
  start: number;
  end: number;
  kind?: 'function' | 'const';
  groupPrefix?: string;
  items: ImportItem[];
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function removeUnusedImports(text: string): { text: string; removed: string[] } {
  const masked = maskNonCode(text);
  const statements = parseImportStatements(masked);

  let code = masked;
  for (const { start, end } of statements) code = code.slice(0, start) + ' '.repeat(end - start) + code.slice(end);
  const docblocks = (text.match(/\/\*\*[\s\S]*?\*\//g) ?? []).join('\n');

  const isUsed = (alias: string, kind: ImportStatement['kind']) => {
    const flags = kind === 'const' ? '' : 'i';
    const inCode = new RegExp(`(?<![\\w$\\\\])(?<!->)(?<!::)${escape(alias)}(?!\\w)`, flags).test(code);
    return inCode || (!kind && new RegExp(`(?<![\\w$\\\\-])${escape(alias)}(?!\\w)`, flags).test(docblocks));
  };

  const removed: string[] = [];
  let result = text;
  for (const statement of [...statements].reverse()) {
    const used = statement.items.filter((item) => isUsed(item.alias, statement.kind));
    if (used.length === statement.items.length) continue;
    removed.unshift(...statement.items.filter((item) => !used.includes(item)).map((item) => item.text));

    if (used.length) {
      result = result.slice(0, statement.start) + renderStatement(statement, used) + result.slice(statement.end);
      continue;
    }
    const trailing = /^[ \t]*(\r?\n|$)/.exec(masked.slice(statement.end));
    const end = trailing ? statement.end + trailing[0].length : statement.end;
    result = result.slice(0, statement.start) + result.slice(end);
    result = collapseBlankLine(result, statement.start);
  }
  return { text: result, removed };
}

function parseImportStatements(masked: string): ImportStatement[] {
  const statements: ImportStatement[] = [];
  for (const m of masked.matchAll(/^use\s+(?:(function|const)\s+)?([^;]+);/gm)) {
    if (braceDepth(masked, m.index) !== 0) continue;
    const body = m[2].trim();
    const group = /^([\w\\]+\\)\s*\{([^}]*)\}$/.exec(body);
    const items = (group ? group[2] : body)
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .map((item) => ({ text: item, alias: /\bas (\w+)$/.exec(item)?.[1] ?? item.split('\\').pop()! }));
    statements.push({ start: m.index, end: m.index + m[0].length, kind: m[1] as ImportStatement['kind'], groupPrefix: group?.[1], items });
  }
  return statements;
}

function braceDepth(masked: string, index: number): number {
  let depth = 0;
  for (let i = 0; i < index; i++) {
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') depth--;
  }
  return depth;
}

function renderStatement(statement: ImportStatement, items: ImportItem[]): string {
  const keyword = statement.kind ? `use ${statement.kind} ` : 'use ';
  if (!statement.groupPrefix) return `${keyword}${items.map((i) => i.text).join(', ')};`;
  if (items.length === 1) return `${keyword}${statement.groupPrefix}${items[0].text};`;
  return `${keyword}${statement.groupPrefix}{${items.map((i) => i.text).join(', ')}};`;
}

function collapseBlankLine(text: string, lineStart: number): string {
  const previousLineBlank = /(^|\n)[ \t]*\r?\n$/.test(text.slice(Math.max(0, lineStart - 200), lineStart));
  const nextBlank = /^[ \t]*\r?\n/.exec(text.slice(lineStart));
  return previousLineBlank && nextBlank ? text.slice(0, lineStart) + text.slice(lineStart + nextBlank[0].length) : text;
}
