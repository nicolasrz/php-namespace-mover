import * as fs from 'node:fs';
import * as path from 'node:path';
import { isIdentifier } from './php';

export interface Psr4Root {
  prefix: string;
  dir: string;
}

export function findComposerJson(startDir: string, rootDir: string): string | undefined {
  for (let dir = startDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'composer.json');
    if (fs.existsSync(candidate)) return candidate;
    if (dir === rootDir || path.dirname(dir) === dir) return undefined;
  }
}

export function readPsr4Roots(composerJsonPath: string): Psr4Root[] {
  const composer = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8'));
  const base = path.dirname(composerJsonPath);
  const roots: Psr4Root[] = [];
  for (const section of ['autoload', 'autoload-dev']) {
    const psr4: Record<string, string | string[]> = composer[section]?.['psr-4'] ?? {};
    for (const [prefix, dirs] of Object.entries(psr4)) {
      for (const dir of [dirs].flat()) {
        roots.push({ prefix: prefix.replace(/\\+$/, ''), dir: path.resolve(base, dir) });
      }
    }
  }
  return roots;
}

export function namespaceForDirectory(dir: string, roots: Psr4Root[]): string | undefined {
  const root = roots
    .filter((r) => dir === r.dir || dir.startsWith(r.dir + path.sep))
    .sort((a, b) => b.dir.length - a.dir.length)[0];
  if (!root) return undefined;

  const relative = path.relative(root.dir, dir);
  const segments = relative ? relative.split(path.sep) : [];
  if (!segments.every(isIdentifier)) return undefined;
  return [root.prefix, ...segments].filter(Boolean).join('\\');
}
