import { parseArgs } from 'node:util';
import { z } from 'zod';
import { newPasswordSchema } from '@new-cms/cms/identity';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { createRuntime } from '../bootstrap/create-runtime.ts';
import { loadConfig } from '../bootstrap/load-config.ts';
import { readPassword } from './read-password.ts';
import { initializationFailure, passwordPrompt } from './initialization-error.ts';

const passwordInput = z.object({ password: newPasswordSchema });

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  if (!values.email) throw new CmsError('invalid_input');
  const config = loadConfig();
  const { password } = passwordInput.parse({ password: await readPassword(passwordPrompt) });
  const runtime = createRuntime(config);
  try {
    await runtime.verifyDatabaseAccess();
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

void main().catch((error: unknown) => {
  process.stderr.write(initializationFailure(error));
  process.exitCode = 1;
});
