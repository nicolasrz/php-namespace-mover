const declarations = [
  'interface Traversable {}',
  'interface Countable { public function count(): int; }',
  'interface Stringable { public function __toString(): string; }',
  'interface JsonSerializable { public function jsonSerialize(): mixed; }',
  'interface IteratorAggregate extends Traversable { public function getIterator(): \\Traversable; }',
  'interface Iterator extends Traversable { public function current(): mixed; public function next(): void; public function key(): mixed; public function valid(): bool; public function rewind(): void; }',
  'interface ArrayAccess { public function offsetExists(mixed $offset): bool; public function offsetGet(mixed $offset): mixed; public function offsetSet(mixed $offset, mixed $value): void; public function offsetUnset(mixed $offset): void; }',
];

const sources = new Map(declarations.map((d) => [/interface (\w+)/.exec(d)![1].toLowerCase(), `<?php\n${d}\n`]));

export const builtinClassSource = (fqcn: string): string | undefined => sources.get(fqcn.toLowerCase());
