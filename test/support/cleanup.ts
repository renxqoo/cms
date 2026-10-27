export async function cleanupAll(actions: readonly (() => unknown)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Test resource cleanup failed');
}
