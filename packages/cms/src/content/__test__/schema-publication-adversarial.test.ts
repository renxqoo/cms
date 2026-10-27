import { randomInt, randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { contentLimits } from '../../../../../test/support/content.ts';
import { createRegistry, generateArtifacts, generateEvolution } from '../generate.ts';
import type { CollectionDefinition } from '../definition.ts';
import { validateData } from '../fields/validate-data.ts';
import { createContentStore } from '../adapters/postgres/store.ts';
import { createContentSchemaMigrator } from '../schema-migrator.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
});
async function fixture() {
  const kit = await createTestDatabase({ migrationScope: 'library' });
  resources.push(kit);
  const limits = contentLimits();
  const previous: CollectionDefinition = {
    id: 'publication_backfill_review',
    key: 'records',
    label: 'Records',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 10, retentionMs: 0 },
    locales: { default: 'en', supported: ['en'], fallback: {} },
    fields: [{ id: 'title', name: 'title', type: 'text' }],
  };
  const oldRegistry = createRegistry({ collections: [previous], limits });
  const old = generateArtifacts(oldRegistry);
  await kit.database.query(old.sql);
  const next: CollectionDefinition = {
    ...previous,
    schemaVersion: 2,
    previousSchemas: [previous],
    fields: [{ id: 'title', name: 'title', type: 'text', required: true }],
    migrations: [{ from: 1, version: 'required-title-1', transform: (data) => data }],
  };
  const registry = createRegistry({ collections: [next], limits });
  const evolution = generateEvolution({ previous: old.snapshot, registry });
  expect(evolution.requiresManualMigration).toBe(false);
  await kit.database.query(evolution.sql);
  const oldStore = createContentStore({ mapping: old.mapping, limits });
  const actorId = randomUUID(),
    id = randomUUID(),
    versionId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'publication-review@example.test',id FROM roles WHERE is_super",
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
  const service = createContentSchemaMigrator({
    database: kit.database,
    registry,
    mapping: evolution.mapping,
    limits,
    policy: createTestPolicy({ securityLockKey: randomInt(1, 1_000_000_000) }),
    resourceLockKey: randomInt(1_000_000_001, 2_000_000_000),
  });
  return {
    ...kit,
    actorId,
    service,
    oldStore,
    previous,
    limits,
    mapping: evolution.mapping,
    id,
    versionId,
  };
}
it('a draft backfill marker cannot bypass newly required published fields after an old writer publishes the same version', async () => {
  const kit = await fixture();
  const input = { collection: 'records', from: 1, to: 2, pageSize: 1 };
  await expect(kit.service.backfill(input)).resolves.toMatchObject({
    processed: 1,
    complete: true,
  });
  expect(
    await validateData({
      collection: kit.previous,
      data: {},
      locale: 'en',
      mode: 'publish',
      limits: kit.limits,
    }),
  ).toEqual({});
  await kit.database.transaction((tx) =>
    kit.oldStore.updateDocumentPointers(tx, {
      actorId: kit.actorId,
      collection: 'records',
      id: kit.id,
      revision: 2,
      expectedRevision: 1,
      currentVersionId: kit.versionId,
      publishedVersionId: kit.versionId,
    }),
  );
  expect(
    (
      await kit.database.query(
        'SELECT schema_version,revision FROM content_revisions WHERE id=$1',
        [kit.versionId],
      )
    ).rows,
  ).toEqual([{ schema_version: 1, revision: 1 }]);
  const completion = async () => {
    try {
      await kit.service.backfill(input);
      await kit.service.activate();
      return { accepted: true };
    } catch (error) {
      if (!(error instanceof CmsError)) throw error;
      return { accepted: false, code: error.code };
    }
  };
  const result = await completion();
  expect(result.accepted).toBe(false);
  expect(['invalid_input', 'temporarily_unavailable']).toContain(result.code);
  expect(
    (
      await kit.database.query(
        'SELECT schema_version,prepared_schema_version FROM content_schema_control WHERE collection_id=$1',
        ['publication_backfill_review'],
      )
    ).rows,
  ).toEqual([{ schema_version: 1, prepared_schema_version: 2 }]);
  expect(
    (
      await kit.database.query('SELECT status FROM content_schema_manifests WHERE fingerprint=$1', [
        kit.mapping.fingerprint,
      ])
    ).rows,
  ).toEqual([{ status: 'preparing' }]);
  expect(
    (
      await kit.database.query(
        "SELECT count(*)::text AS count FROM audit_events WHERE operation_id='content.activateSchema' AND target_id=$1",
        [kit.mapping.fingerprint],
      )
    ).rows,
  ).toEqual([{ count: '0' }]);
  await kit.database.transaction((tx) =>
    kit.oldStore.updateDocumentPointers(tx, {
      actorId: kit.actorId,
      collection: 'records',
      id: kit.id,
      revision: 3,
      expectedRevision: 2,
      currentVersionId: kit.versionId,
      publishedVersionId: null,
    }),
  );
  await expect(kit.service.backfill(input)).resolves.toMatchObject({ complete: true });
  await expect(kit.service.activate()).resolves.toEqual({
    fingerprint: kit.mapping.fingerprint,
    collections: ['records'],
  });
});
