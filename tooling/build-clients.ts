import { spawnSync } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';

for (const application of ['cli', 'mcp']) {
  const result = spawnSync(
    process.execPath,
    [
      'build',
      `apps/${application}/src/main.ts`,
      '--target=node',
      '--format=esm',
      `--outdir=apps/${application}/dist`,
      '--packages=external',
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Client build failed: ${application}`);
}
const cli = 'apps/cli/dist/main.js';
await writeFile(cli, `#!/usr/bin/env node\n${await readFile(cli, 'utf8')}`);
await chmod(cli, 0o755);
