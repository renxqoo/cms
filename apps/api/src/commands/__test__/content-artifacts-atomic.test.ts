import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type * as FileSystem from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { createRegistry } from '@new-cms/cms/content/generate';
import { collections } from '../../config/collections/index.ts';
import { contentLimits } from '../../config/content-policy.ts';
import { contentArtifacts, writeContentArtifacts } from '../content-artifacts.ts';

const fault = vi.hoisted(() => ({ prefix: '' }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return {
    ...actual,
    async writeFile(...args: Parameters<typeof actual.writeFile>) {
      if (fault.prefix && typeof args[0] === 'string' && args[0].startsWith(fault.prefix))
        throw new Error('Injected filesystem write failure');
      await actual.writeFile(...args);
    },
  };
});
const directories: string[] = [];
afterEach(async () => {
  fault.prefix = '';
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'cms-generation-recovery-'));
  directories.push(root);
  return root;
}
const snapshot = 'packages/database/src/schema/generated/content-snapshot.json';
it('can retry initial generation when migration publication fails after its recovery snapshot is durable', async () => {
  const root = await directory();
  const options = { root, check: false, migration: '0003_collections.sql' };
  fault.prefix = join(root, 'packages/database/migrations/0003_collections.sql');
  await expect(writeContentArtifacts(options)).rejects.toThrow('Injected filesystem');
  await expect(readFile(join(root, snapshot))).rejects.toMatchObject({ code: 'ENOENT' });
  expect(
    await readFile(join(root, 'packages/database/migrations/0003_collections.plan.json'), 'utf8'),
  ).toContain('"previous": null');
  fault.prefix = '';
  await writeContentArtifacts(options);
  await expect(writeContentArtifacts({ ...options, check: true })).resolves.toBeUndefined();
});
it.each(['plan.json', 'sql', 'generated'])(
  'keeps the old active snapshot and recovers an incremental generation after a %s publication failure',
  async (failure) => {
    const root = await directory();
    await writeContentArtifacts({ root, check: false, migration: '0003_collections.sql' });
    const original = await readFile(join(root, snapshot), 'utf8');
    const next = createRegistry({
      collections: collections.map((collection) =>
        collection.key === 'settings'
          ? {
              ...collection,
              schemaVersion: 2,
              previousSchemas: [collection],
              migrations: [{ from: 1, version: '1', transform: (data) => data }],
              fields: [
                ...collection.fields,
                { id: 'recovery_flag', name: 'recoveryFlag', type: 'boolean' },
              ],
            }
          : collection,
      ),
      limits: contentLimits(),
    });
    const options = { root, check: false, migration: '0011_increment.sql', registry: next };
    fault.prefix =
      failure === 'generated'
        ? join(root, 'packages/database/src/schema/generated/content.ts')
        : join(root, `packages/database/migrations/0011_increment.${failure}`);
    await expect(writeContentArtifacts(options)).rejects.toThrow('Injected filesystem');
    expect(await readFile(join(root, snapshot), 'utf8')).toBe(original);
    fault.prefix = '';
    await writeContentArtifacts(options);
    await expect(writeContentArtifacts({ ...options, check: true })).resolves.toBeUndefined();
    const sql = await readFile(
      join(root, 'packages/database/migrations/0011_increment.sql'),
      'utf8',
    );
    for (const table of contentArtifacts().mapping.plan.tables)
      expect(sql).not.toContain(`CREATE TABLE "${table.name}"`);
    expect(sql).toContain('CREATE TABLE');
    expect(await readFile(join(root, snapshot), 'utf8')).not.toBe(original);
  },
);
