export async function cleanupAll(actions: readonly (() => unknown)[]): Promise<void> {
  const results = await Promise.allSettled(actions.map((action) => Promise.resolve().then(action)));
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (errors.length > 0) throw new AggregateError(errors, 'Test resource cleanup failed');
}
