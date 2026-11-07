import * as fs from 'node:fs';
import * as path from 'node:path';
import { Psr4Root, readPsr4Roots } from './composer';

export type ClassLocator = (fqcn: string) => string | undefined;

/** Projet via composer.json, dépendances via les fichiers générés par `composer dump-autoload`. */
export function createClassLocator(composerJsonPath: string): ClassLocator {
  const base = path.dirname(composerJsonPath);
  const composer = JSON.parse(fs.readFileSync(composerJsonPath, 'utf8'));
  const vendorDir = path.resolve(base, composer.config?.['vendor-dir'] ?? 'vendor');
  const generated = (file: string) => {
    try {
      return fs.readFileSync(path.join(vendorDir, 'composer', file), 'utf8');
    } catch {
      return '';
    }
  };
  const resolveDir = (variable: string, relative: string) =>
    path.join(variable === 'vendorDir' ? vendorDir : path.dirname(vendorDir), relative);
  const unescape = (s: string) => s.replace(/\\\\/g, '\\');

  const roots: Psr4Root[] = [...readPsr4Roots(composerJsonPath)];
  for (const m of generated('autoload_psr4.php').matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*=>\s*array\((.*)\),?\s*$/gm)) {
    for (const dir of m[2].matchAll(/\$(vendorDir|baseDir)\s*\.\s*'([^']*)'/g)) {
      roots.push({ prefix: unescape(m[1]).replace(/\\+$/, ''), dir: resolveDir(dir[1], dir[2]) });
    }
  }
  roots.sort((a, b) => b.prefix.length - a.prefix.length);

  const classmap = new Map<string, string>();
  for (const m of generated('autoload_classmap.php').matchAll(/^\s*'((?:[^'\\]|\\.)*)'\s*=>\s*\$(vendorDir|baseDir)\s*\.\s*'([^']*)'/gm)) {
    classmap.set(unescape(m[1]), resolveDir(m[2], m[3]));
  }

  return (fqcn) => {
    const mapped = classmap.get(fqcn);
    if (mapped) return mapped;
    for (const { prefix, dir } of roots) {
      if (prefix && !fqcn.startsWith(`${prefix}\\`)) continue;
      const relative = prefix ? fqcn.slice(prefix.length + 1) : fqcn;
      const file = path.join(dir, ...relative.split('\\')) + '.php';
      if (fs.existsSync(file)) return file;
    }
    return undefined;
  };
}
