export function populationDepth(
  input: { depth: number; currentDepth?: number },
  maxDepth?: number,
): number {
  return Math.max(
    0,
    Math.min(
      input.depth,
      maxDepth === undefined ? input.depth : maxDepth - (input.currentDepth ?? 1) + 1,
    ),
  );
}
