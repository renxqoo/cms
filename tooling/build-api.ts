import { cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  [
    'build',
    'apps/api/src/main.ts',
    'apps/api/src/commands/migrate.ts',
    'apps/api/src/commands/grant-runtime-role.ts',
    'apps/api/src/commands/initialize-admin.ts',
    'apps/api/src/commands/reconcile-operations.ts',
    '--target=node',
    '--format=esm',
    '--outdir=apps/api/dist',
    '--external=pg',
    '--external=drizzle-orm',
    '--external=nodemailer',
    '--external=zod',
    '--external=hono',
    '--external=@hono/node-server',
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
  await mkdir('apps/api/dist/migrations', { recursive: true });
  await cp('packages/database/migrations', 'apps/api/dist/migrations', { recursive: true });
}
