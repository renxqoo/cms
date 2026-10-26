import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { createRuntime } from '../bootstrap/create-runtime.ts';
import { loadConfig } from '../bootstrap/load-config.ts';
import { readPassword } from './read-password.ts';
import { initializeInterfaceContent } from './interface-initialization.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' } } });
  if (!values.email) throw new CmsError('invalid_input');
  const password = await readPassword('Administrator password: ');
  const config = loadConfig();
  const runtime = createRuntime(config);
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const ctx = { requestId: randomUUID(), ip: '127.0.0.1', signal: abort.signal };
  let token: string | undefined;
  try {
    await runtime.verifyDatabaseAccess(abort.signal);
    const login = z
      .object({ token: z.string() })
      .parse(await runtime.identity.api.login(ctx, { email: values.email, password }));
    ({ token } = login);
    const result = await initializeInterfaceContent(runtime.content.api, { ...ctx, token });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    try {
      if (token)
        await runtime.identity.api.logout({
          requestId: randomUUID(),
          ip: ctx.ip,
          token,
          signal: AbortSignal.timeout(config.policy.requestTimeoutMs),
        });
    } finally {
      await runtime.close();
    }
  }
}
void main().catch(() => {
  process.stderr.write(
    'Content initialization failed; verify administrator credentials, content permissions and configuration. Existing content was preserved; rerun after resolving the failure.\n',
  );
  process.exitCode = 1;
});
