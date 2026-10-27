import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execute = promisify(execFile);

it.each(['', 'other-build'])(
  'packaging rejects an empty or mismatched completed build ID before staging: %j',
  async (build) => {
    const root = await mkdtemp(join(tmpdir(), 'cms-release-build-identity-'));
    try {
      for (const path of [
        'apps/api/dist/commands',
        'apps/admin/.next/standalone/.next',
        'apps/admin/.next/static',
      ])
        await mkdir(join(root, path), { recursive: true });
      for (const file of [
        'apps/api/dist/main.js',
        'apps/api/dist/commands/migrate.js',
        'apps/api/dist/commands/initialize-admin.js',
        'apps/api/dist/commands/initialize-content.js',
        'apps/admin/.next/standalone/server.js',
      ])
        await writeFile(join(root, file), '');
      await writeFile(join(root, 'apps/admin/.next/BUILD_ID'), build);
      await writeFile(join(root, 'apps/admin/.next/standalone/.next/BUILD_ID'), 'completed-build');
      const source = `import { packageRelease } from ${JSON.stringify(new URL('../../scripts/lib/release-package.ts', import.meta.url).href)};
await packageRelease({ root: ${JSON.stringify(root)}, id: 'build-identity', commit: '${'a'.repeat(40)}', bunVersion: '1.4.4' });`;
      await expect(execute(process.execPath, ['--eval', source])).rejects.toThrow(
        'Run bun run build before packaging a complete production standalone output',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
