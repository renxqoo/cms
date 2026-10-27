import { randomInt, randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { contentLimits } from '../../../../../test/support/content.ts';
import { createRegistry, generateArtifacts, generateEvolution } from '../generate.ts';
import type { CollectionDefinition } from '../definition.ts';
import { createContentStore } from '../adapters/postgres/store.ts';
import { createContentSchemaMigrator } from '../schema-migrator.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
});
it('schema backfill allocates shared default array IDs once so every localized child survives activation and filtering', async () => {
  const kit = await createTestDatabase({ migrationScope: 'library' });
  resources.push(kit);
  const limits = contentLimits();
  const previous: CollectionDefinition = {
    id: 'shared_defaults_backfill_review',
    key: 'records',
    label: 'Records',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 10, retentionMs: 0 },
    locales: { default: 'en', supported: ['en', 'zh'], fallback: {} },
    fields: [],
  };
  const initial = generateArtifacts(createRegistry({ collections: [previous], limits }));
  await kit.database.query(initial.sql);
  const oldStore = createContentStore({ mapping: initial.mapping, limits });
  const actorId = randomUUID(),
    id = randomUUID(),
    versionId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'shared-defaults@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  await kit.database.transaction(async (tx) => {
    await oldStore.insertDocument(tx, { collection: 'records', id, actorId });
    await oldStore.insertRevision(tx, {
      collection: 'records',
      documentId: id,
      id: versionId,
      revision: 1,
      schemaVersion: 1,
      actorId,
      kind: 'save',
      locale: 'en',
      data: {},
    });
    await oldStore.updateDocumentPointers(tx, {
      actorId,
      collection: 'records',
      id,
      revision: 1,
      expectedRevision: 0,
      currentVersionId: versionId,
      publishedVersionId: null,
    });
  });
  const next: CollectionDefinition = {
    ...previous,
    schemaVersion: 2,
    previousSchemas: [previous],
    fields: [
      {
        id: 'rows',
        name: 'rows',
        type: 'array',
        defaultValue: [{ label: 'Seed' }],
        fields: [{ id: 'label', name: 'label', type: 'text', localized: true, required: true }],
      },
    ],
    migrations: [{ from: 1, version: 'default-array-1', transform: (data) => data }],
  };
  const registry = createRegistry({ collections: [next], limits });
  const evolution = generateEvolution({ previous: initial.snapshot, registry });
  expect(evolution.requiresManualMigration).toBe(false);
  await kit.database.query(evolution.sql);
  const service = createContentSchemaMigrator({
    database: kit.database,
    registry,
    mapping: evolution.mapping,
    limits,
    policy: createTestPolicy({ securityLockKey: randomInt(1, 1_000_000_000) }),
    resourceLockKey: randomInt(1_000_000_001, 2_000_000_000),
  });
  await expect(
    service.backfill({ collection: 'records', from: 1, to: 2, pageSize: 1 }),
  ).resolves.toMatchObject({ processed: 1, complete: true });
  await expect(service.activate()).resolves.toEqual({
    fingerprint: evolution.mapping.fingerprint,
    collections: ['records'],
  });
  const store = createContentStore({ mapping: evolution.mapping, limits });
  const read = (locale: string) =>
    kit.database.transaction((tx) =>
      store.readRevisionData(tx, {
        collection: 'records',
        documentId: id,
        versionId,
        locale,
        fallback: [],
      }),
    );
  const en = await read('en');
  const zh = await read('zh');
  expect(zh).toEqual(en);
  const { rows } = en;
  if (!Array.isArray(rows)) throw new Error('Missing expected default array');
  const [child] = rows;
  if (child === null || typeof child !== 'object' || Array.isArray(child))
    throw new Error('Missing expected default child');
  const { id: childId } = child;
  expect(childId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/));
  expect(en).toEqual({ rows: [{ id: childId, label: 'Seed' }] });
  for (const locale of ['en', 'zh']) {
    const page = await kit.database.transaction((tx) =>
      store.queryDocuments(tx, {
        collection: 'records',
        limits,
        query: {
          locale,
          fallback: [],
          mode: 'editing',
          page: 1,
          pageSize: 10,
          where: { field: 'rows.label', operator: 'eq', value: 'Seed' },
        },
      }),
    );
    expect(page.total).toBe(1);
    expect(page.rows.map((row) => ({ id: row.document.id, data: row.data }))).toEqual([
      { id, data: { rows: [{ id: childId, label: 'Seed' }] } },
    ]);
  }
  const original = await kit.database.transaction((tx) =>
    oldStore.readRevisionData(tx, {
      collection: 'records',
      documentId: id,
      versionId,
      locale: 'en',
    }),
  );
  expect(original).toEqual({});
});
