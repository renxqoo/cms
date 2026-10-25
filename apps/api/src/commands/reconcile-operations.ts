import { createRuntime } from '../bootstrap/create-runtime.ts';
import { loadConfig } from '../bootstrap/load-config.ts';

async function main(): Promise<void> {
  const runtime = createRuntime(loadConfig());
  try {
    await runtime.access.reconcile();
    await runtime.access.verifyReady();
    process.stdout.write('Operation catalog reconciled.\n');
  } finally {
    await runtime.close();
  }
}

void main().catch(() => {
  process.stderr.write('Operation reconciliation failed.\n');
  process.exitCode = 1;
});
