import { parseArgs } from 'node:util';
import { createRuntime } from '../bootstrap/create-runtime.ts';
import { loadConfig } from '../bootstrap/load-config.ts';
import { readPassword } from './read-password.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  if (!values.email) throw new Error('--email is required');
  const password = await readPassword();
  const runtime = createRuntime(loadConfig());
  try {
    await runtime.access.initializeAdmin({
      email: values.email,
      displayName: values.name ?? null,
      password,
    });
    process.stdout.write('Administrator initialized.\n');
  } finally {
    await runtime.close();
  }
}

void main().catch(() => {
  process.stderr.write('Administrator initialization failed.\n');
  process.exitCode = 1;
});
