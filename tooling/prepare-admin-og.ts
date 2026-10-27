import { resolve } from 'node:path';
import { build } from 'bun';
export async function prepareAdminOGWorker() {
  const root = resolve(import.meta.dirname, '../apps/admin');
  const result = await build({
    entrypoints: [resolve(root, 'src/server/collection-og-worker.ts')],
    outdir: resolve(root, '.generated'),
    naming: 'og-worker.mjs',
    target: 'node',
    format: 'esm',
    packages: 'external',
  });
  if (!result.success)
    throw new AggregateError(result.logs, 'Could not prepare the private metadata renderer');
}
if (import.meta.main) await prepareAdminOGWorker();
