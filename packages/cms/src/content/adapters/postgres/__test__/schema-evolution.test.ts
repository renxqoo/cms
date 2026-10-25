import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../../../test/support/database.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import {
  createRegistry,
  generateArtifacts,
  generateEvolution,
  parseContentSchemaSnapshot,
} from '../../../generate.ts';
import type { CollectionDefinition, DocumentData } from '../../../definition.ts';
import { createContentStore } from '../store.ts';
import { parseQuery } from '../../../queries/parse-query.ts';
import { collectReferences } from '../../../fields/collect-references.ts';
const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
});
const original: CollectionDefinition = {
  id: 'evolution_articles',
  key: 'articles',
  label: 'Articles',
  schemaVersion: 1,
  mode: 'drafts',
  history: { maxVersions: 20, retentionMs: 0 },
  locales: { default: 'en', supported: ['en', 'zh'], fallback: { zh: ['en'] } },
  fields: [
    { id: 'title', name: 'title', type: 'text', localized: true, unique: true },
    { id: 'score', name: 'score', type: 'number' },
    { id: 'related', name: 'related', type: 'relationship', relationTo: ['articles'] },
  ],
};
async function fixture(
  next: (definition: CollectionDefinition) => CollectionDefinition,
  previous = original,
) {
  const kit = await createTestDatabase();
  resources.push(kit);
  const limits = contentLimits();
  const first = generateArtifacts(createRegistry({ collections: [previous], limits }));
  await kit.database.query(first.sql);
  const actorId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'evolve@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  const oldStore = createContentStore({ mapping: first.mapping, limits });
  const registry = createRegistry({ collections: [next(previous)], limits });
  const evolution = generateEvolution({ previous: first.snapshot, registry });
  const store = createContentStore({ mapping: evolution.mapping, limits });
  return { ...kit, limits, first, oldStore, store, evolution, registry, actorId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function save(
  kit: Fixture,
  data: DocumentData,
  options: { id?: string; store?: typeof kit.oldStore; draft?: boolean; versionId?: string } = {},
) {
  const { id, store = kit.oldStore } = options;
  const documentId = id ?? randomUUID();
  const versionId = options.versionId ?? randomUUID();
  return kit.database.transaction(async (tx) => {
    let revision = 1;
    let publishedVersionId: string | null = null;
    if (id) {
      const current = await store.readDocument(tx, { collection: 'articles', id, lock: true });
      revision = current.revision + 1;
      ({ publishedVersionId } = current);
    } else
      await store.insertDocument(tx, {
        collection: 'articles',
        id: documentId,
        actorId: kit.actorId,
      });
    await store.insertRevision(tx, {
      collection: 'articles',
      id: versionId,
      documentId,
      actorId: kit.actorId,
      revision,
      schemaVersion: store.definition('articles').schemaVersion,
      locale: 'en',
      data,
      kind: 'save',
    });
    await store.updateDocumentPointers(tx, {
      collection: 'articles',
      id: documentId,
      expectedRevision: revision - 1,
      revision,
      currentVersionId: versionId,
      publishedVersionId: options.draft ? null : (publishedVersionId ?? versionId),
    });
    await store.syncActiveUnique(tx, { collection: 'articles', id: documentId });
    return { id: documentId, versionId };
  });
}
async function backfill(kit: Fixture) {
  let cursor: string | undefined;
  for (let step = 0; step < 20; step += 1) {
    const page = await kit.database.transaction((tx) =>
      kit.store.backfillSchema(tx, {
        collection: 'articles',
        from: 1,
        to: 2,
        pageSize: 1,
        ...(cursor ? { cursor } : {}),
      }),
    );
    if (page.complete) return;
    expect(page.cursor).not.toBeNull();
    cursor = page.cursor ?? undefined;
  }
  throw new Error('Backfill did not converge');
}
function converted(before: CollectionDefinition): CollectionDefinition {
  return {
    ...before,
    schemaVersion: 2,
    previousSchemas: [before],
    indexes: [{ id: 'title_score', fields: ['title', 'score'] }],
    search: ['title'],
    migrations: [
      {
        from: 1,
        version: 'uppercase-1',
        transform: (data) => ({
          ...data,
          ...(typeof data['title'] === 'string' ? { title: data['title'].toUpperCase() } : {}),
        }),
      },
    ],
  };
}
it('same-type transforms populate new typed indexes and active unique union while historical bytes stay immutable', async () => {
  const kit = await fixture(converted);
  const first = await save(kit, { title: 'old', score: 1 });
  await save(kit, { title: 'draft', score: 2 }, { id: first.id });
  expect(kit.evolution.requiresManualMigration).toBe(false);
  expect(kit.evolution.requiresBackfill).toBe(true);
  await kit.database.query(kit.evolution.sql);
  await expect(kit.database.transaction((tx) => kit.store.verifyReady(tx))).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  await expect(
    kit.database.transaction((tx) => kit.store.activateSchema(tx)),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  await kit.database.transaction((tx) => kit.store.verifyReady(tx));
  const query = parseQuery({
    collection: kit.registry.get('articles'),
    limits: kit.limits,
    input: {
      where: { field: 'title', operator: 'eq', value: 'DRAFT' },
      sort: [{ field: 'score', order: 'desc' }],
    },
  });
  const rows = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, { collection: 'articles', query, limits: kit.limits }),
  );
  expect(rows.total).toBe(1);
  expect(rows.rows[0]?.data).toEqual({ title: 'DRAFT', score: 2 });
  const old = kit.first.mapping.get('articles').flat.find((field) => field.field.id === 'title');
  if (!old) throw new Error('Missing title');
  const raw = await kit.database.query<{ value: string }>(
    `SELECT value FROM "${old.table}" WHERE revision_id=$1`,
    [first.versionId],
  );
  expect(raw.rows).toEqual([{ value: 'old' }]);
  await expect(save(kit, { title: 'OLD' }, { store: kit.store })).rejects.toMatchObject({
    code: '23505',
  });
  await expect(save(kit, { title: 'DRAFT' }, { store: kit.store })).rejects.toMatchObject({
    code: '23505',
  });
  await expect(save(kit, { title: 'late' }, { store: kit.oldStore })).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});
it('tail backfill catches old-writer revisions and pointer changes after an earlier page was complete', async () => {
  const kit = await fixture(converted);
  const first = await save(kit, { title: 'first' });
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await save(kit, { title: 'late' }, { id: first.id });
  await expect(
    kit.database.transaction((tx) => kit.store.activateSchema(tx)),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  const data = await kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'articles',
      documentId: first.id,
      versionId: first.versionId,
      locale: 'en',
    }),
  );
  expect(data['title']).toBe('FIRST');
  await kit.database.query('DELETE FROM content_schema_manifests WHERE fingerprint=$1', [
    kit.evolution.mapping.fingerprint,
  ]);
  await expect(
    kit.database.transaction((tx) => kit.store.activateSchema(tx)),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});
it('an existing draft backfill marker cannot bypass publish validation after the old writer changes its pointer', async () => {
  const kit = await fixture((before) => ({
    ...before,
    schemaVersion: 2,
    previousSchemas: [before],
    fields: before.fields.map((field) =>
      field.id === 'title' ? { ...field, required: true } : field,
    ),
    migrations: [{ from: 1, version: 'require-title', transform: (data) => data }],
  }));
  const first = await save(kit, {}, { draft: true });
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await kit.database.transaction((tx) =>
    kit.oldStore.updateDocumentPointers(tx, {
      collection: 'articles',
      id: first.id,
      expectedRevision: 1,
      revision: 2,
      currentVersionId: first.versionId,
      publishedVersionId: first.versionId,
    }),
  );
  await expect(backfill(kit)).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.database.transaction((tx) => kit.store.activateSchema(tx)),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  const status = await kit.database.query<{ status: string }>(
    'SELECT status FROM content_schema_manifests WHERE fingerprint=$1',
    [kit.evolution.mapping.fingerprint],
  );
  expect(status.rows).toEqual([{ status: 'preparing' }]);
  await kit.database.transaction((tx) =>
    kit.oldStore.updateDocumentPointers(tx, {
      collection: 'articles',
      id: first.id,
      expectedRevision: 2,
      revision: 3,
      currentVersionId: first.versionId,
      publishedVersionId: null,
    }),
  );
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  await kit.database.transaction((tx) => kit.store.verifyReady(tx));
});
it('a tail page containing a different historical revision still validates the newly published pointer', async () => {
  const kit = await fixture((before) => ({
    ...before,
    schemaVersion: 2,
    previousSchemas: [before],
    fields: before.fields.map((field) =>
      field.id === 'title' ? { ...field, required: true } : field,
    ),
    migrations: [{ from: 1, version: 'require-title', transform: (data) => data }],
  }));
  const missing = await save(
    kit,
    {},
    {
      draft: true,
      versionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    },
  );
  const valid = await save(
    kit,
    { title: 'Current draft' },
    { id: missing.id, draft: true, versionId: '00000000-0000-4000-8000-000000000001' },
  );
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await kit.database.transaction((tx) =>
    kit.oldStore.updateDocumentPointers(tx, {
      collection: 'articles',
      id: missing.id,
      expectedRevision: 2,
      revision: 3,
      currentVersionId: valid.versionId,
      publishedVersionId: missing.versionId,
    }),
  );
  await expect(backfill(kit)).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.database.transaction((tx) => kit.store.activateSchema(tx)),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});
it('backfill defaults allocate one shared array identity before writing localized children', async () => {
  const kit = await fixture((before) => ({
    ...before,
    schemaVersion: 2,
    previousSchemas: [before],
    fields: [
      ...before.fields,
      {
        id: 'rows',
        name: 'rows',
        type: 'array',
        defaultValue: [{ label: 'Seed' }],
        fields: [{ id: 'row_label', name: 'label', type: 'text', localized: true }],
      },
    ],
    migrations: [{ from: 1, version: 'default-rows', transform: (data) => data }],
  }));
  const first = await save(kit, {}, { draft: true });
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  const data: DocumentData[] = [];
  for (const locale of ['en', 'zh'])
    data.push(
      await kit.database.transaction((tx) =>
        kit.store.readRevisionData(tx, {
          collection: 'articles',
          documentId: first.id,
          versionId: first.versionId,
          locale,
          fallback: [],
        }),
      ),
    );
  const [english, chinese] = data;
  expect(english).toMatchObject({ rows: [{ label: 'Seed' }] });
  expect(chinese).toMatchObject({ rows: [{ label: 'Seed' }] });
  expect(chinese?.['rows']).toEqual(english?.['rows']);
});
it.each(['new', 'replacement', 'moved'])(
  'schema transforms cannot introduce a %s media capability without the original reference',
  async (kind) => {
    const previous: CollectionDefinition = {
      ...original,
      fields: [...original.fields, { id: 'body', name: 'body', type: 'richText' }],
    };
    let replacementId = '';
    let originalId = '';
    const kit = await fixture(
      (before) => ({
        ...before,
        schemaVersion: 2,
        previousSchemas: [before],
        migrations: [
          {
            from: 1,
            version: 'replace-media',
            transform: (data) =>
              data['score'] === 1
                ? {
                    ...data,
                    body: {
                      version: 1,
                      children: [
                        ...(kind === 'moved' ? [{ type: 'text', text: 'Moved' }] : []),
                        {
                          type: 'media',
                          collection: 'articles',
                          id: kind === 'moved' ? originalId : replacementId,
                        },
                      ],
                    },
                  }
                : data,
          },
        ],
      }),
      previous,
    );
    const old = await save(kit, { title: 'Old media' }, { draft: true });
    originalId = old.id;
    const replacement = await save(kit, { title: 'Replacement media' }, { draft: true });
    replacementId = replacement.id;
    const data: DocumentData = {
      title: 'Source',
      score: 1,
      ...(kind !== 'new'
        ? {
            body: { version: 1, children: [{ type: 'media', collection: 'articles', id: old.id }] },
          }
        : {}),
    };
    const source = await save(kit, data, { draft: true });
    const references = ['en', 'zh'].flatMap((locale) =>
      collectReferences({ collection: previous, data, locale, limits: kit.limits }).map(
        (reference) => ({ ...reference, path: `${locale}:${reference.path}` }),
      ),
    );
    await kit.database.transaction((tx) =>
      kit.oldStore.writeReferences(tx, {
        collection: 'articles',
        documentId: source.id,
        versionId: source.versionId,
        references,
      }),
    );
    await kit.database.query(kit.evolution.sql);
    await expect(backfill(kit)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      kit.database.transaction((tx) => kit.store.activateSchema(tx)),
    ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  },
);
it('media origins survive field and locale renames while ordinary relationship transforms can change targets', async () => {
  const previous: CollectionDefinition = {
    ...original,
    fields: [...original.fields, { id: 'body', name: 'body', type: 'richText' }],
  };
  let replacementId = '';
  const kit = await fixture(
    (before) => ({
      ...before,
      schemaVersion: 2,
      previousSchemas: [before],
      locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: { 'zh-CN': ['en'] } },
      fields: before.fields.map((field) =>
        field.id === 'body' ? { ...field, name: 'articleBody' } : field,
      ),
      migrations: [
        {
          from: 1,
          version: 'rename-media-and-replace-relation',
          localeMap: { en: 'en', 'zh-CN': 'zh' },
          transform: (data) => {
            const { body, ...rest } = data;
            return {
              ...rest,
              ...(body ? { articleBody: body } : {}),
              ...(data['score'] === 1
                ? { related: { collection: 'articles', id: replacementId } }
                : {}),
            };
          },
        },
      ],
    }),
    previous,
  );
  const old = await save(kit, { title: 'Old target' }, { draft: true });
  const replacement = await save(kit, { title: 'Replacement target' }, { draft: true });
  replacementId = replacement.id;
  const data: DocumentData = {
    title: 'Source',
    score: 1,
    body: { version: 1, children: [{ type: 'media', collection: 'articles', id: old.id }] },
    related: { collection: 'articles', id: old.id },
  };
  const source = await save(kit, data, { draft: true });
  const references = ['en', 'zh'].flatMap((locale) =>
    collectReferences({ collection: previous, data, locale, limits: kit.limits }).map(
      (reference) => ({ ...reference, path: `${locale}:${reference.path}` }),
    ),
  );
  await kit.database.transaction((tx) =>
    kit.oldStore.writeReferences(tx, {
      collection: 'articles',
      documentId: source.id,
      versionId: source.versionId,
      references,
    }),
  );
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  const migrated = await kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'articles',
      documentId: source.id,
      versionId: source.versionId,
      locale: 'zh-CN',
      fallback: [],
    }),
  );
  expect(migrated['articleBody']).toEqual(data['body']);
  expect(migrated['related']).toEqual({ collection: 'articles', id: replacement.id });
});
it('locale renames use explicit origin mapping and preserve old localized typed rows', async () => {
  const kit = await fixture((before) => ({
    ...before,
    schemaVersion: 2,
    previousSchemas: [before],
    locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: { 'zh-CN': ['en'] } },
    migrations: [
      {
        from: 1,
        version: 'locale-1',
        localeMap: { en: 'en', 'zh-CN': 'zh' },
        transform: (data) => data,
      },
    ],
  }));
  const first = await save(kit, { title: 'English' });
  await kit.database.transaction(async (tx) => {
    await kit.oldStore.insertRevision(tx, {
      collection: 'articles',
      id: randomUUID(),
      documentId: first.id,
      actorId: kit.actorId,
      revision: 2,
      schemaVersion: 1,
      locale: 'zh',
      data: { title: '中文' },
      previousVersionId: first.versionId,
      kind: 'save',
    });
  });
  const revision = await kit.database.query<{ id: string }>(
    'SELECT id FROM content_revisions WHERE document_id=$1 AND revision=2',
    [first.id],
  );
  const versionId = revision.rows[0]?.id;
  if (!versionId) throw new Error('Missing revision');
  const input = {
    collection: 'articles',
    documentId: first.id,
    versionId,
    locale: 'zh-CN',
    fallback: [],
  };
  expect(await kit.database.transaction((tx) => kit.store.readRevisionData(tx, input))).toEqual({
    title: '中文',
  });
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  expect(await kit.database.transaction((tx) => kit.store.readRevisionData(tx, input))).toEqual({
    title: '中文',
  });
});
it('same-version projection additions require versioning and retention-only changes preserve immutable schema identity', async () => {
  const kit = await fixture((before) => ({
    ...before,
    indexes: [{ id: 'title_score', fields: ['title', 'score'] }],
  }));
  expect(kit.evolution.requiresManualMigration).toBe(true);
  expect(kit.evolution.manualReasons).toContain('schemaVersionRequired:articles');
  const behavior = createRegistry({
    collections: [{ ...original, history: { maxVersions: 2, retentionMs: 99 } }],
    limits: kit.limits,
  });
  expect(
    generateEvolution({
      previous: parseContentSchemaSnapshot(JSON.parse(JSON.stringify(kit.first.snapshot))),
      registry: behavior,
    }).requiresMigration,
  ).toBe(false);
  const invalid = {
    ...kit.first.snapshot,
    collections: [{ ...kit.first.snapshot.collections[0], dataFingerprint: 'invalid' }],
  };
  expect(() => parseContentSchemaSnapshot(invalid)).toThrowError('invalid input');
});

it('removing the final relation leaves an empty active projection while original history still protects its target', async () => {
  const kit = await fixture((before) => ({
    ...before,
    schemaVersion: 2,
    previousSchemas: [before],
    fields: before.fields.filter((field) => field.id !== 'related'),
    migrations: [
      {
        from: 1,
        version: 'remove-relation',
        transform: (data) => {
          const { related: _related, ...next } = data;
          return next;
        },
      },
    ],
  }));
  const target = await save(kit, { title: 'target' });
  const source = await save(kit, {
    title: 'source',
    related: { collection: 'articles', id: target.id },
  });
  await kit.database.transaction((tx) =>
    kit.oldStore.writeReferences(tx, {
      collection: 'articles',
      documentId: source.id,
      versionId: source.versionId,
      references: [
        {
          collection: 'articles',
          id: target.id,
          path: 'en:related',
          fieldId: 'related',
          media: false,
          onDelete: 'restrict',
        },
      ],
    }),
  );
  expect(
    await kit.database.transaction((tx) =>
      kit.oldStore.inboundReferences(tx, { collection: 'articles', id: target.id, active: true }),
    ),
  ).toHaveLength(1);
  await kit.database.query(kit.evolution.sql);
  await backfill(kit);
  await kit.database.transaction((tx) => kit.store.activateSchema(tx));
  expect(
    await kit.database.transaction((tx) =>
      kit.store.inboundReferences(tx, { collection: 'articles', id: target.id, active: true }),
    ),
  ).toEqual([]);
  await expect(
    kit.database.transaction((tx) =>
      kit.store.purgeDocument(tx, { collection: 'articles', id: target.id }),
    ),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
});
