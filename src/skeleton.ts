export const SKELETON_KINDS = ['class', 'final class', 'abstract class', 'interface', 'trait', 'enum'] as const;
export type SkeletonKind = (typeof SKELETON_KINDS)[number];

export function guessKind(name: string): SkeletonKind | undefined {
  if (/.Interface$/.test(name)) return 'interface';
  if (/.Trait$/.test(name)) return 'trait';
  if (/^Abstract[A-Z]/.test(name)) return 'abstract class';
  return undefined;
}

export function phpSkeleton(
  namespace: string,
  name: string,
  kind: SkeletonKind,
  options: { strictTypes: boolean; eol: string; indent: string },
): { text: string; cursor: { line: number; character: number } } {
  const lines = [
    '<?php',
    '',
    ...(options.strictTypes ? ['declare(strict_types=1);', ''] : []),
    `namespace ${namespace};`,
    '',
    `${kind} ${name}`,
    '{',
    options.indent,
    '}',
    '',
  ];
  return { text: lines.join(options.eol), cursor: { line: lines.length - 3, character: options.indent.length } };
}
