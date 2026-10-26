import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

await rm('apps/api/dist', { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [
    'build',
    'apps/api/src/main.ts',
    'apps/api/src/commands/migrate.ts',
    'apps/api/src/commands/grant-runtime-role.ts',
    'apps/api/src/commands/initialize-admin.ts',
    'apps/api/src/commands/initialize-content.ts',
    'apps/api/src/commands/reconcile-operations.ts',
    'apps/api/src/commands/generate-content.ts',
    'apps/api/src/commands/backfill-content.ts',
    'apps/api/src/commands/reconcile-assets.ts',
    '--target=node',
    '--format=esm',
    '--outdir=apps/api/dist',
    '--root=apps/api/src',
    '--external=pg',
    '--external=sharp',
    '--external=@aws-sdk/client-s3',
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
  for (const destination of ['apps/api/dist/resources', 'apps/api/dist/commands/resources']) {
    await cp('apps/api/src/config/resources', destination, { recursive: true });
  }
}
