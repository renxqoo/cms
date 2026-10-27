import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { identifier } from '@new-cms/database/codegen';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { contentLimits } from '../../../../../test/support/content.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createRegistry, generateArtifacts, generateEvolution } from '../generate.ts';
import type { CollectionDefinition } from '../definition.ts';
import { createContentStore } from '../adapters/postgres/store.ts';
import { createLocaleMapping } from '../locale-source.ts';
import type { ContentOptions } from '../types.ts';
import { createContentSchemaMigrator } from '../schema-migrator.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
});
function definitions() {
  const previous: CollectionDefinition = {
    id: 'maintenance_records',
    key: 'records',
    label: 'Records',
    schemaVersion: 1,
    mode: 'drafts',
    history: { maxVersions: 10, retentionMs: 0 },
    locales: { default: 'en', supported: ['en'], fallback: {} },
    fields: [
      { id: 'value', name: 'value', type: 'text' },
      { id: 'code', name: 'code', type: 'text', unique: true },
    ],
  };
  const next: CollectionDefinition = {
    ...previous,
    schemaVersion: 2,
    previousSchemas: [previous],
    fields: [
      { id: 'value', name: 'value', type: 'number' },
      { id: 'code', name: 'code', type: 'text', unique: true },
    ],
    migrations: [
      {
        from: 1,
        version: 'text-to-number-1',
        transform: (data) => ({ ...data, value: Number(data['value']) }),
      },
    ],
  };
  return { previous, next };
}
const resolveLocaleSource: NonNullable<ContentOptions['resolveLocaleSource']> = () =>
  Promise.resolve({ default: 'en', supported: ['en', 'fr'], fallback: {}, enabled: ['en'] });
async function fixture(
  input: { prepare?: boolean; renameCollection?: boolean; dynamic?: boolean } = {},
) {
  const kit = await createTestDatabase({ migrationScope: 'library' });
  resources.push(kit);
  const limits = contentLimits();
  const policy = createTestPolicy({ securityLockKey: randomInt(1, 1_000_000_000) });
  const resourceLockKey = randomInt(1_000_000_001, 2_000_000_000);
  const definition = definitions();
  if (input.renameCollection) {
    definition.previous = { ...definition.previous, key: 'legacy_records' };
    definition.next = { ...definition.next, previousSchemas: [definition.previous] };
  }
  if (input.dynamic) {
    definition.previous = {
      ...definition.previous,
      localeSource: 'siteLanguages',
      fields: definition.previous.fields.map((field) =>
        field.id === 'value' ? { ...field, localized: true } : field,
      ),
    };
    definition.next = {
      ...definition.next,
      localeSource: 'siteLanguages',
      previousSchemas: [definition.previous],
      fields: definition.next.fields.map((field) =>
        field.id === 'value' ? { ...field, localized: true } : field,
      ),
    };
  }
  const oldRegistry = createRegistry({ collections: [definition.previous], limits });
  const old = generateArtifacts(oldRegistry);
  await kit.database.query(old.sql);
  const actorId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'schema@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  const registry = createRegistry({ collections: [definition.next], limits });
  const evolution = generateEvolution({ previous: old.snapshot, registry });
  expect(evolution.requiresManualMigration).toBe(input.renameCollection === true);
  expect(evolution.manualReasons).toEqual(
    input.renameCollection ? ['collectionKeyMigrationRequired:legacy_records:records'] : [],
  );
  if (input.prepare !== false) await kit.database.query(evolution.sql);
  const oldStore = createContentStore({
    mapping: old.mapping,
    limits,
    ...(input.dynamic
      ? { mappingFor: createLocaleMapping({ mapping: old.mapping, limits, resolveLocaleSource }) }
      : {}),
  });
  const options = {
    database: kit.database,
    registry,
    mapping: evolution.mapping,
    limits,
    policy,
    resourceLockKey,
    ...(input.dynamic ? { resolveLocaleSource } : {}),
  };
  const service = createContentSchemaMigrator(options);
  return { ...kit, actorId, oldRegistry, old, oldStore, options, service };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function save(
  kit: Fixture,
  input: { value: string; code: string; id?: string; publish?: boolean; french?: string },
) {
  const id = input.id ?? randomUUID();
  const versionId = randomUUID();
  const row = await kit.database.transaction(async (tx) => {
    const previous = input.id
      ? await kit.oldStore.readDocument(tx, { collection: 'records', id, lock: true })
      : undefined;
    if (!previous)
      await kit.oldStore.insertDocument(tx, { collection: 'records', id, actorId: kit.actorId });
    const revision = (previous?.revision ?? 0) + 1;
    await kit.oldStore.insertRevision(tx, {
      collection: 'records',
      documentId: id,
      id: versionId,
      revision,
      schemaVersion: 1,
      actorId: kit.actorId,
      locale: 'en',
      data: { value: input.value, code: input.code },
      ...(input.french
        ? {
            dataByLocale: {
              en: { value: input.value, code: input.code },
              fr: { value: input.french, code: input.code },
            },
          }
        : {}),
      kind: 'save',
    });
    await kit.oldStore.updateDocumentPointers(tx, {
      actorId: kit.actorId,
      collection: 'records',
      id,
      revision,
      expectedRevision: revision - 1,
      currentVersionId: versionId,
      publishedVersionId: input.publish ? versionId : (previous?.publishedVersionId ?? null),
    });
    await kit.oldStore.syncActiveProjections(tx, { collection: 'records', id });
    return { id, versionId, revision };
  });
  return row;
}
async function complete(kit: Fixture) {
  let cursor: string | undefined;
  let processed = 0;
  for (let page = 0; page < 20; page += 1) {
    const result = await kit.service.backfill({
      collection: 'records',
      from: 1,
      to: 2,
      pageSize: 1,
      ...(cursor ? { cursor } : {}),
    });
    expect(result.processed).toBeLessThanOrEqual(1);
    processed += result.processed;
    if (result.complete) return processed;
    const { cursor: next } = result;
    if (!next) throw new Error('Incomplete backfill must provide a resumable cursor');
    cursor = next;
  }
  throw new Error('Bounded fixture backfill did not finish');
}
async function audits(kit: Fixture) {
  return (
    await kit.database.query<{
      actor_kind: string;
      actor_id: string | null;
      operation_id: string;
      detail: Record<string, unknown>;
    }>(
      "SELECT actor_kind,actor_id,operation_id,detail FROM audit_events WHERE target_type='contentSchema' ORDER BY created_at,id",
    )
  ).rows;
}
async function rejectAudit(kit: Fixture, operationId: string) {
  await kit.database.query(
    `CREATE FUNCTION reject_schema_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='${operationId}' THEN RAISE EXCEPTION 'Injected schema audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_schema_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_schema_audit()`,
  );
}
async function counts(kit: Fixture) {
  return (
    await kit.database.query<{ revisions: string; coverage: string; documents: string }>(
      'SELECT (SELECT count(*) FROM content_revisions WHERE collection_id=$1)::text AS revisions,(SELECT count(*) FROM content_schema_backfills WHERE collection_id=$1)::text AS coverage,(SELECT count(*) FROM content_schema_document_backfills WHERE collection_id=$1)::text AS documents',
      ['maintenance_records'],
    )
  ).rows;
}

it('backfills bounded immutable history pages, preserves old values and commits system audits with activation', async () => {
  const kit = await fixture();
  const first = await save(kit, { value: '10', code: 'published', publish: true });
  const edited = await save(kit, { value: '20', code: 'editing', id: first.id });
  await save(kit, { value: '30', code: 'other' });
  await expect(kit.service.activate()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(await audits(kit)).toEqual([]);
  expect(await complete(kit)).toBe(3);
  const raw = await kit.database.query<{ schema_version: number }>(
    'SELECT schema_version FROM content_revisions WHERE collection_id=$1 ORDER BY id',
    ['maintenance_records'],
  );
  expect(raw.rows).toEqual([{ schema_version: 1 }, { schema_version: 1 }, { schema_version: 1 }]);
  const oldValue = await kit.database.transaction((tx) =>
    kit.oldStore.readRevisionData(tx, {
      collection: 'records',
      documentId: first.id,
      versionId: first.versionId,
      locale: 'en',
    }),
  );
  expect(oldValue).toEqual({ value: '10', code: 'published' });
  const activated = await kit.service.activate();
  expect(activated).toEqual({
    fingerprint: kit.options.mapping.fingerprint,
    collections: ['records'],
  });
  const pointers = await kit.database.transaction((tx) =>
    kit.oldStore.readDocument(tx, { collection: 'records', id: first.id }),
  );
  expect(pointers).toMatchObject({
    revision: 2,
    currentVersionId: edited.versionId,
    publishedVersionId: first.versionId,
  });
  const store = createContentStore({ mapping: kit.options.mapping, limits: kit.options.limits });
  const page = await kit.database.transaction((tx) =>
    store.queryDocuments(tx, {
      collection: 'records',
      limits: kit.options.limits,
      query: {
        locale: 'en',
        fallback: [],
        mode: 'editing',
        page: 1,
        pageSize: 10,
        where: { field: 'value', operator: 'gte', value: 20 },
      },
    }),
  );
  expect(page.total).toBe(2);
  expect(
    page.rows
      .map((row) => row.data['value'])
      .toSorted((left, right) => Number(left) - Number(right)),
  ).toEqual([20, 30]);
  const events = await audits(kit);
  expect(events.map((event) => event.operation_id).toSorted()).toEqual([
    'content.activateSchema',
    'content.backfillSchema',
    'content.backfillSchema',
    'content.backfillSchema',
  ]);
  for (const event of events)
    expect({ kind: event.actor_kind, actor: event.actor_id }).toEqual({
      kind: 'system',
      actor: null,
    });
});
it('rechecks tail revisions before activation and fences old writers after the schema becomes active', async () => {
  const kit = await fixture();
  await save(kit, { value: '10', code: 'first' });
  await complete(kit);
  await save(kit, { value: '20', code: 'tail' });
  await expect(kit.service.activate()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await complete(kit);
  await kit.service.activate();
  const before = await counts(kit);
  await expect(save(kit, { value: '30', code: 'old-writer' })).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  expect(await counts(kit)).toEqual(before);
  await expect(kit.service.activate()).resolves.toEqual({
    fingerprint: kit.options.mapping.fingerprint,
    collections: ['records'],
  });
});
it('rolls back typed projections and coverage when the same-transaction backfill audit fails', async () => {
  const kit = await fixture();
  await save(kit, { value: '10', code: 'first' });
  await rejectAudit(kit, 'content.backfillSchema');
  await expect(
    kit.service.backfill({ collection: 'records', from: 1, to: 2, pageSize: 1 }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(await counts(kit)).toEqual([{ revisions: '1', coverage: '0', documents: '0' }]);
  const field = kit.options.mapping.get('records').flat.find((entry) => entry.path === 'value');
  if (!field) throw new Error('Missing expected number field');
  expect(
    (await kit.database.query(`SELECT count(*)::text AS count FROM ${identifier(field.table)}`))
      .rows,
  ).toEqual([{ count: '0' }]);
  expect(await audits(kit)).toEqual([]);
  await kit.database.query('DROP TRIGGER reject_schema_audit ON audit_events');
  expect(await complete(kit)).toBe(1);
});
it('rolls back control activation and ready status when its audit cannot commit', async () => {
  const kit = await fixture();
  await save(kit, { value: '10', code: 'first' });
  await complete(kit);
  await rejectAudit(kit, 'content.activateSchema');
  await expect(kit.service.activate()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(
    (
      await kit.database.query(
        'SELECT schema_version,prepared_schema_version FROM content_schema_control WHERE collection_id=$1',
        ['maintenance_records'],
      )
    ).rows,
  ).toEqual([{ schema_version: 1, prepared_schema_version: 2 }]);
  expect(
    (
      await kit.database.query('SELECT status FROM content_schema_manifests WHERE fingerprint=$1', [
        kit.options.mapping.fingerprint,
      ])
    ).rows,
  ).toEqual([{ status: 'preparing' }]);
  await kit.database.query('DROP TRIGGER reject_schema_audit ON audit_events');
  await expect(kit.service.activate()).resolves.toMatchObject({ collections: ['records'] });
});
it('activation waits for existing security readers instead of sharing their lock', async () => {
  const kit = await fixture({ prepare: false });
  const service = createContentSchemaMigrator({
    ...kit.options,
    registry: kit.oldRegistry,
    mapping: kit.old.mapping,
  });
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const blocker = kit.database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock_shared($1::bigint)', [
      kit.options.policy.securityLockKey,
    ]);
    held.resolve();
    await release.promise;
  });
  await held.promise;
  const activated = service.activate();
  try {
    expect(await Promise.race([activated.then(() => 'completed'), delay(40, 'blocked')])).toBe(
      'blocked',
    );
  } finally {
    release.resolve();
    await blocker;
  }
  await expect(activated).resolves.toEqual({
    fingerprint: kit.old.mapping.fingerprint,
    collections: ['records'],
  });
});
it('cancels a blocked maintenance transaction without later committing a page or leaking its pool client', async () => {
  const kit = await fixture();
  await save(kit, { value: '10', code: 'first' });
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const blocker = kit.database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [kit.options.resourceLockKey]);
    held.resolve();
    await release.promise;
  });
  await held.promise;
  const controller = new AbortController();
  const pending = kit.service.backfill({
    collection: 'records',
    from: 1,
    to: 2,
    pageSize: 1,
    signal: controller.signal,
  });
  try {
    expect(await Promise.race([pending.then(() => 'completed'), delay(40, 'blocked')])).toBe(
      'blocked',
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    expect(await audits(kit)).toEqual([]);
    expect(await counts(kit)).toEqual([{ revisions: '1', coverage: '0', documents: '0' }]);
  } finally {
    release.resolve();
    await blocker;
  }
  expect(await complete(kit)).toBe(1);
});
it('rejects invalid maintenance input and enforces SQL budgets before any data or audit can escape', async () => {
  const kit = await fixture();
  await save(kit, { value: '10', code: 'first' });
  for (const values of [
    { from: 2, to: 1, pageSize: 1 },
    { from: 1, to: 2, pageSize: 0 },
    { from: 1, to: 2, pageSize: 101 },
    { from: 1, to: 3, pageSize: 1 },
    { from: 1, to: 2, pageSize: 1, cursor: 'invalid' },
  ])
    await expect(kit.service.backfill({ collection: 'records', ...values })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  const bounded = createContentSchemaMigrator({
    ...kit.options,
    limits: { ...kit.options.limits, maxSqlQueries: 1 },
  });
  await expect(
    bounded.backfill({ collection: 'records', from: 1, to: 2, pageSize: 1 }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  const aborted = new AbortController();
  aborted.abort();
  await expect(kit.service.activate(aborted.signal)).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  expect(await audits(kit)).toEqual([]);
  expect(await counts(kit)).toEqual([{ revisions: '1', coverage: '0', documents: '0' }]);
});
it('stale activation cannot clear a newer prepared schema or emit a misleading activation audit', async () => {
  const kit = await fixture();
  const stale = createContentSchemaMigrator({
    ...kit.options,
    registry: kit.oldRegistry,
    mapping: kit.old.mapping,
  });
  await expect(stale.activate()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(
    (
      await kit.database.query(
        'SELECT schema_version,prepared_schema_version FROM content_schema_control WHERE collection_id=$1',
        ['maintenance_records'],
      )
    ).rows,
  ).toEqual([{ schema_version: 1, prepared_schema_version: 2 }]);
  expect(await audits(kit)).toEqual([]);
  await expect(kit.service.activate()).resolves.toMatchObject({
    fingerprint: kit.options.mapping.fingerprint,
  });
});
it.each(['backfill', 'activate'] as const)(
  'applies a total %s deadline while waiting for a PostgreSQL lock without an external signal',
  async (operation) => {
    const kit = await fixture({ prepare: operation === 'backfill' });
    if (operation === 'backfill') await save(kit, { value: '10', code: 'first' });
    const options = {
      ...kit.options,
      ...(operation === 'activate' ? { registry: kit.oldRegistry, mapping: kit.old.mapping } : {}),
      policy: { ...kit.options.policy, requestTimeoutMs: 50 },
    };
    const service = createContentSchemaMigrator(options);
    const held = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const blocker = kit.database.transaction(async (tx) => {
      await tx.query(
        operation === 'activate'
          ? 'SELECT pg_advisory_xact_lock_shared($1::bigint)'
          : 'SELECT pg_advisory_xact_lock($1::bigint)',
        [operation === 'activate' ? options.policy.securityLockKey : options.resourceLockKey],
      );
      held.resolve();
      await release.promise;
    });
    await held.promise;
    const started = performance.now();
    const pending =
      operation === 'activate'
        ? service.activate()
        : service.backfill({ collection: 'records', from: 1, to: 2, pageSize: 1 });
    try {
      await expect(pending).rejects.toMatchObject({ code: 'temporarily_unavailable' });
      expect(performance.now() - started).toBeLessThan(1000);
      expect(await audits(kit)).toEqual([]);
    } finally {
      release.resolve();
      await blocker;
    }
    const recovery = operation === 'backfill' ? complete(kit) : service.activate();
    const expected =
      operation === 'backfill'
        ? 1
        : { fingerprint: options.mapping.fingerprint, collections: ['records'] };
    await expect(recovery).resolves.toEqual(expected);
  },
);
it('rejects misassembled registries, stale plans and invalid advisory lock or deadline configuration before using the database', async () => {
  const kit = await fixture();
  expect(() =>
    createContentSchemaMigrator({ ...kit.options, registry: kit.oldRegistry }),
  ).toThrowError('invalid input');
  const { next } = definitions();
  const renamed = createRegistry({
    collections: [
      {
        ...next,
        fields: next.fields.map((field) =>
          field.id === 'value' ? { ...field, name: 'amount' } : field,
        ),
      },
    ],
    limits: kit.options.limits,
  });
  expect(generateArtifacts(renamed).mapping.fingerprint).toBe(kit.options.mapping.fingerprint);
  expect(() => createContentSchemaMigrator({ ...kit.options, registry: renamed })).toThrowError(
    'invalid input',
  );
  expect(() =>
    createContentSchemaMigrator({
      ...kit.options,
      mapping: { ...kit.options.mapping, plan: { version: 1, tables: [] } },
    }),
  ).toThrowError('invalid input');
  for (const resourceLockKey of [
    NaN,
    Infinity,
    0.5,
    Number.MAX_SAFE_INTEGER + 1,
    kit.options.policy.securityLockKey,
  ])
    expect(() => createContentSchemaMigrator({ ...kit.options, resourceLockKey })).toThrowError(
      'invalid input',
    );
  for (const requestTimeoutMs of [0, -1, Infinity, 2 ** 31])
    expect(() =>
      createContentSchemaMigrator({
        ...kit.options,
        policy: { ...kit.options.policy, requestTimeoutMs },
      }),
    ).toThrowError('invalid input');
  expect(await audits(kit)).toEqual([]);
});
it('activates a stable collection identity after a reviewed API key change while retaining its old schema decoder', async () => {
  const kit = await fixture({ renameCollection: true });
  await expect(
    kit.service.backfill({ collection: 'records', from: 1, to: 2, pageSize: 1 }),
  ).resolves.toMatchObject({ processed: 0, complete: true });
  await expect(kit.service.activate()).resolves.toEqual({
    fingerprint: kit.options.mapping.fingerprint,
    collections: ['records'],
  });
  expect(
    (
      await kit.database.query(
        'SELECT collection_id,schema_version,prepared_schema_version FROM content_schema_control WHERE collection_id=$1',
        ['maintenance_records'],
      )
    ).rows,
  ).toEqual([
    { collection_id: 'maintenance_records', schema_version: 2, prepared_schema_version: null },
  ]);
});

it('backfills registered disabled-language values without losing their original history or requiring translations for other languages', async () => {
  const kit = await fixture({ dynamic: true });
  const saved = await save(kit, { value: '10', code: 'dynamic', french: '20', publish: true });
  expect(await complete(kit)).toBe(1);
  await kit.service.activate();
  const store = createContentStore({
    mapping: kit.options.mapping,
    limits: kit.options.limits,
    mappingFor: createLocaleMapping(kit.options),
  });
  const translated = await kit.database.transaction((tx) =>
    store.readRevisionData(tx, {
      collection: 'records',
      documentId: saved.id,
      versionId: saved.versionId,
      locale: 'fr',
      fallback: [],
    }),
  );
  expect(translated['value']).toBe(20);
  expect(
    (
      await kit.database.transaction((tx) =>
        kit.oldStore.readRevisionData(tx, {
          collection: 'records',
          documentId: saved.id,
          versionId: saved.versionId,
          locale: 'fr',
          fallback: [],
        }),
      )
    )['value'],
  ).toBe('20');
});
