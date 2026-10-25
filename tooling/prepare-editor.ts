import { cp, mkdir, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(new URL('../packages/ui/package.json', import.meta.url));
const source = dirname(require.resolve('monaco-editor/package.json'));
const output = resolve(import.meta.dirname, '../apps/admin/public/generated/editor');
const staging = `${output}-${randomUUID()}`;

try {
  await mkdir(staging, { recursive: true });
  await cp(resolve(source, 'min/vs'), resolve(staging, 'vs'), { recursive: true });
  await cp(resolve(source, 'LICENSE'), resolve(staging, 'LICENSE'));
  await rm(output, { recursive: true, force: true });
  await rename(staging, output);
  process.stdout.write('Prepared local Monaco editor and worker assets.\n');
} finally {
  await rm(staging, { recursive: true, force: true });
}
