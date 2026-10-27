import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createDatabase } from '@new-cms/database/client';
import { assertRuntimePrivileges, grantRuntimePrivileges } from '@new-cms/database/privileges';
import type { RuntimePrivilegeProfile } from '@new-cms/database/privileges';
import { createTestRuntimeDatabase } from '../../../../../../../test/support/runtime-database.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import { createRegistry, generateArtifacts, generateEvolution } from '../../../generate.ts';
import type { CollectionDefinition } from '../../../definition.ts';
import { createContentStore } from '../store.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0).toReversed()) await resource.close();
});
async function fixture() {
  const kit = await createTestRuntimeDatabase();
  resources.push(kit);
  const limits = contentLimits();
  const before: CollectionDefinition = {
    id: 'runtime_schema_role',
    key: 'records',
    label: 'Records',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 10, retentionMs: 0 },
    locales: { default: 'en', supported: ['en'], fallback: {} },
    fields: [{ id: 'title', name: 'title', type: 'text' }],
  };
  const original = generateArtifacts(createRegistry({ collections: [before], limits }));
  await kit.database.query(original.sql);
  const next = createRegistry({
    collections: [
      {
        ...before,
        schemaVersion: 2,
        previousSchemas: [before],
        migrations: [{ from: 1, version: 'identity', transform: (data) => data }],
      },
    ],
    limits,
  });
  const evolution = generateEvolution({ previous: original.snapshot, registry: next });
  await kit.database.query(evolution.sql);
  const profile: RuntimePrivilegeProfile = original.mapping.plan.tables.map(({ name }) => ({
    name,
    privileges: ['SELECT', 'INSERT'],
  }));
  await grantRuntimePrivileges(kit.database, { roleName: kit.roleName, profile });
  await assertRuntimePrivileges(kit.runtime, profile);
  const actorId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'runtime-schema@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  return {
    ...kit,
    limits,
    actorId,
    old: createContentStore({ mapping: original.mapping, limits }),
    next: createContentStore({ mapping: evolution.mapping, limits }),
  };
}

it('a runtime writer can validate its schema with SELECT-only metadata privileges', async () => {
  const kit = await fixture();
  await expect(
    kit.runtime.transaction((tx) =>
      kit.old.insertDocument(tx, {
        collection: 'records',
        id: randomUUID(),
        actorId: kit.actorId,
      }),
    ),
  ).resolves.toBeUndefined();
  await expect(
    kit.runtime.query('UPDATE content_schema_control SET schema_version=schema_version'),
  ).rejects.toMatchObject({ code: '42501' });
});

it('activation waits for a SELECT-only runtime writer and rejects unbackfilled commits before disabling the old schema', async () => {
  const kit = await fixture();
  const id = randomUUID(),
    versionId = randomUUID();
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writer = kit.runtime.transaction(async (tx) => {
    await kit.old.insertDocument(tx, { collection: 'records', id, actorId: kit.actorId });
    held.resolve();
    await release.promise;
    await kit.old.insertRevision(tx, {
      collection: 'records',
      documentId: id,
      id: versionId,
      actorId: kit.actorId,
      revision: 1,
      schemaVersion: 1,
      kind: 'save',
      locale: 'en',
      data: { title: 'Before activation' },
    });
    await kit.old.updateDocumentPointers(tx, {
      actorId: kit.actorId,
      collection: 'records',
      id,
      expectedRevision: 0,
      revision: 1,
      currentVersionId: versionId,
      publishedVersionId: null,
    });
  });
  void writer.catch((error: unknown) => held.reject(error));
  const activator = createDatabase({
    connectionString: kit.connectionString,
    schema: kit.schema,
    lockTimeoutMs: 100,
  });
  resources.push(activator);
  try {
    await held.promise;
    await expect(activator.transaction((tx) => kit.next.activateSchema(tx))).rejects.toMatchObject({
      code: '55P03',
    });
  } finally {
    release.resolve();
    await writer;
  }
  await expect(kit.database.transaction((tx) => kit.next.activateSchema(tx))).rejects.toMatchObject(
    { code: 'temporarily_unavailable' },
  );
  await kit.database.transaction((tx) =>
    kit.next.backfillSchema(tx, { collection: 'records', from: 1, to: 2, pageSize: 1 }),
  );
  await kit.database.transaction((tx) => kit.next.activateSchema(tx));
  await expect(
    kit.runtime.transaction((tx) =>
      kit.old.insertDocument(tx, {
        collection: 'records',
        id: randomUUID(),
        actorId: kit.actorId,
      }),
    ),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});
