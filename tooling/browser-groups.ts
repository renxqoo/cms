import { cleanupAll } from '../test/support/cleanup.ts';
import { specificationArguments } from './e2e-plan.ts';

export function browserGroups(args: readonly string[], available: readonly string[]): string[][] {
  const { files: specifications, filters } = specificationArguments(args);
  const selected = specifications.filter((arg) => arg.endsWith('.browser.spec.ts'));
  const files = [...new Set(selected.length > 0 ? selected : available)].toSorted();
  if (files.length === 0) throw new Error('No browser specifications were selected.');
  return files.map((file) => [file, ...filters]);
}

export async function isolatedBrowserGroup<T extends { close(): Promise<void> }>(options: {
  signal: AbortSignal;
  open(mode: 'development' | 'production'): Promise<T>;
  run(applications: readonly T[]): Promise<void>;
}) {
  const applications: T[] = [];
  try {
    for (const mode of ['development', 'production'] as const) {
      options.signal.throwIfAborted();
      applications.push(await options.open(mode));
    }
    options.signal.throwIfAborted();
    await options.run(applications);
  } finally {
    await cleanupAll(applications.map((application) => () => application.close()));
  }
}
