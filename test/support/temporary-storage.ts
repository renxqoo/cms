import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createTestStorage() {
  const root = await mkdtemp(join(tmpdir(), 'cms-test-assets-'));
  return { root, close: () => rm(root, { recursive: true, force: true }) };
}
