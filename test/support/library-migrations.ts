import { constants } from 'node:fs';
import { chmod, copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parsePhysicalPlan } from '@new-cms/database/codegen';

const manifest = z.object({ version: z.literal(1), next: z.object({ plan: z.unknown() }) });
async function generated(directory: string, file: string): Promise<boolean> {
  let source: string;
  try {
    source = await readFile(join(directory, file.replace(/\.sql$/u, '.plan.json')), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
  const parsed = manifest.parse(JSON.parse(source));
  parsePhysicalPlan(parsed.next.plan);
  return true;
}

export async function createLibraryMigrationDirectory(
  source = fileURLToPath(new URL('../../packages/database/migrations/', import.meta.url)),
) {
  const directory = await mkdtemp(join(tmpdir(), 'cms-library-migrations-'));
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await chmod(directory, 0o700);
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const files = (await readdir(source))
      .filter((file) => /^\d+_[a-z0-9_]+\.sql$/u.test(file))
      .toSorted();
    let copied = 0;
    for (const file of files) {
      if (await generated(source, file)) continue;
      const destination = join(directory, file);
      await copyFile(join(source, file), destination, constants.COPYFILE_EXCL);
      await chmod(destination, 0o400);
      copied += 1;
    }
    if (copied === 0) throw new Error('Library fixture requires base migrations');
    await chmod(directory, 0o500);
    return { directory, close };
  } catch (error) {
    await close();
    throw error;
  }
}
