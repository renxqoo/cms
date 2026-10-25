import { createRuntime } from '../bootstrap/create-runtime.ts';
import { loadConfig } from '../bootstrap/load-config.ts';

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('Asset reconciliation does not accept arguments');
  const runtime = createRuntime(loadConfig());
  try {
    const result = await runtime.assets.reconcileCleanup();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await runtime.close();
  }
}
void main().catch(() => {
  process.stderr.write('Asset reconciliation failed.\n');
  process.exitCode = 1;
});
