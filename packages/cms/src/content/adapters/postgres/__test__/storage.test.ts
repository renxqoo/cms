import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../../../test/support/database.ts';
import {
  contentDefinitions,
  contentLimits,
  articleData,
} from '../../../../../../../test/support/content.ts';
import { createRegistry, compileContent, generateArtifacts } from '../../../generate.ts';
import { createContentStore } from '../store.ts';
import { validateData } from '../../../fields/validate-data.ts';
import { parseQuery } from '../../../queries/parse-query.ts';
import type { CollectionDefinition, DocumentData, Where } from '../../../definition.ts';

const fixtures: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of fixtures.splice(0)) await resource.close();
});
async function fixture(definitions = contentDefinitions()) {
  const kit = await createTestDatabase();
  fixtures.push(kit);
  const limits = contentLimits();
  const registry = createRegistry({ collections: definitions, limits });
  const artifacts = generateArtifacts(registry);
  await kit.database.query(artifacts.sql);
  const actorId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'content@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  const store = createContentStore({ mapping: artifacts.mapping, limits });
  return { ...kit, registry, mapping: artifacts.mapping, store, limits, actorId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function save(
  kit: Fixture,
  input: {
    collection?: string;
    id?: string;
    data: DocumentData;
    locale?: string;
    publish?: boolean;
    previousVersionId?: string;
  },
) {
  const collection = input.collection ?? 'articles';
  const definition = kit.registry.get(collection);
  const locale = input.locale ?? 'en';
  const id = input.id ?? randomUUID();
  return kit.database.transaction(async (tx) => {
    let revision = 1;
    let publishedVersionId: string | null = null;
    if (input.id) {
      const old = await kit.store.readDocument(tx, { collection, id, lock: true });
      revision = old.revision + 1;
      ({ publishedVersionId } = old);
    } else await kit.store.insertDocument(tx, { collection, id, actorId: kit.actorId });
    const data = validateData({
      collection: definition,
      data: input.data,
      locale,
      mode: 'draft',
      limits: kit.limits,
      applyDefaults: true,
    });
    const version = await kit.store.insertRevision(tx, {
      collection,
      documentId: id,
      id: randomUUID(),
      revision,
      actorId: kit.actorId,
      data,
      locale,
      schemaVersion: definition.schemaVersion,
      kind: 'save',
      ...(input.previousVersionId ? { previousVersionId: input.previousVersionId } : {}),
    });
    await kit.store.updateDocumentPointers(tx, {
      collection,
      id,
      revision,
      expectedRevision: revision - 1,
      currentVersionId: version.id,
      publishedVersionId: input.publish ? version.id : publishedVersionId,
    });
    await kit.store.syncActiveUnique(tx, { collection, id });
    return { id, versionId: version.id, revision };
  });
}
async function find(
  kit: Fixture,
  input: {
    collection?: string;
    where?: Where;
    mode?: 'editing' | 'published';
    locale?: string;
    fallback?: string[];
    queryableFields?: string[];
    page?: number;
    pageSize?: number;
  },
) {
  const collection = input.collection ?? 'articles';
  const { queryableFields, ...queryInput } = input;
  const { collection: _collection, ...query } = queryInput;
  return kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection,
      query: parseQuery({
        collection: kit.registry.get(collection),
        input: query,
        limits: kit.limits,
      }),
      limits: kit.limits,
      ...(queryableFields ? { queryableFields } : {}),
    }),
  );
}
it('persists typed scalar/compound data, stable item identity, blocks and exact timestamps', async () => {
  const kit = await fixture();
  const original = articleData();
  const saved = await save(kit, { data: original });
  const data = await kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'articles',
      documentId: saved.id,
      versionId: saved.versionId,
      locale: 'en',
    }),
  );
  expect(data).toEqual(original);
  const tables = await kit.database.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name LIKE 'cf_%'",
  );
  expect(tables.rows.length).toBeGreaterThan(15);
  const scalar = kit.mapping.get('articles').flat.find((field) => field.path === 'score');
  if (!scalar) throw new Error('Missing numeric mapping');
  const type = await kit.database.query<{ data_type: string }>(
    'SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2',
    [scalar.table, 'value'],
  );
  expect(type.rows).toEqual([{ data_type: 'double precision' }]);
  await kit.database.transaction((tx) => kit.store.verifyReady(tx));
});
it('locale patch preserves nested other-language values and fallback never writes them', async () => {
  const kit = await fixture();
  const first = await save(kit, { data: articleData() });
  const second = await save(kit, {
    id: first.id,
    data: articleData({ title: '中文', seo: { description: '描述' } }),
    locale: 'zh-CN',
    previousVersionId: first.versionId,
  });
  const third = await save(kit, {
    id: first.id,
    data: articleData({ title: 'New English', seo: { description: 'New description' } }),
    previousVersionId: second.versionId,
  });
  const read = (locale: string, fallback: string[] = []) =>
    kit.database.transaction((tx) =>
      kit.store.readRevisionData(tx, {
        collection: 'articles',
        documentId: first.id,
        versionId: third.versionId,
        locale,
        fallback,
      }),
    );
  expect(await read('zh-CN')).toMatchObject({ title: '中文', seo: { description: '描述' } });
  expect(await read('en')).toMatchObject({
    title: 'New English',
    seo: { description: 'New description' },
  });
  const fresh = await save(kit, { data: articleData({ slug: 'fresh' }) });
  const missing = await kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'articles',
      documentId: fresh.id,
      versionId: fresh.versionId,
      locale: 'zh-CN',
      fallback: [],
    }),
  );
  expect(missing['title']).toBeUndefined();
  expect(
    (
      await find(kit, {
        where: { field: 'slug', operator: 'eq', value: 'fresh' },
        locale: 'zh-CN',
        fallback: ['en'],
      })
    ).rows[0]?.data['title'],
  ).toBe('Alpha');
});
it('published queries use published data for filters, ordering and totals after draft edits', async () => {
  const kit = await fixture();
  const first = await save(kit, { data: articleData(), publish: true });
  await save(kit, {
    id: first.id,
    data: articleData({ title: 'Draft only', slug: 'draft' }),
    previousVersionId: first.versionId,
  });
  expect(
    (
      await find(kit, {
        where: { field: 'title', operator: 'eq', value: 'Alpha' },
        mode: 'published',
      })
    ).total,
  ).toBe(1);
  expect(
    (
      await find(kit, {
        where: { field: 'title', operator: 'eq', value: 'Draft only' },
        mode: 'published',
      })
    ).total,
  ).toBe(0);
  expect((await find(kit, { mode: 'editing' })).rows[0]?.data['title']).toBe('Draft only');
});
it('active unique reservations protect both current and published values, histories release theirs', async () => {
  const kit = await fixture();
  const first = await save(kit, { data: articleData(), publish: true });
  await save(kit, {
    id: first.id,
    data: articleData({ slug: 'new-alpha' }),
    previousVersionId: first.versionId,
  });
  await expect(save(kit, { data: articleData({ slug: 'alpha' }) })).rejects.toMatchObject({
    code: '23505',
  });
  await expect(save(kit, { data: articleData({ slug: 'new-alpha' }) })).rejects.toMatchObject({
    code: '23505',
  });
  const direct = await save(kit, { data: articleData({ slug: 'transient' }) });
  await save(kit, {
    id: direct.id,
    data: articleData({ slug: 'replacement' }),
    previousVersionId: direct.versionId,
  });
  await expect(save(kit, { data: articleData({ slug: 'transient' }) })).resolves.toHaveProperty(
    'id',
  );
});
it('concurrent current writes cannot take the same unique value', async () => {
  const kit = await fixture();
  const result = await Promise.allSettled([
    save(kit, { data: articleData({ slug: 'race' }) }),
    save(kit, { data: articleData({ slug: 'race' }) }),
  ]);
  expect(result.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  expect((await find(kit, {})).total).toBe(1);
});
it.each<[Where, number]>([
  [{ field: 'categories', operator: 'eq', value: 'news' }, 1],
  [{ field: 'categories', operator: 'ne', value: 'news' }, 0],
  [{ field: 'categories', operator: 'notIn', value: ['news'] }, 0],
  [{ field: 'categories', operator: 'in', value: ['guide'] }, 1],
  [{ field: 'sections', operator: 'exists', value: true }, 1],
  [{ field: 'sections.items.label', operator: 'eq', value: 'Nested' }, 1],
  [{ field: 'layout.text', operator: 'eq', value: 'Welcome' }, 1],
  [
    {
      and: [
        { field: 'score', operator: 'gte', value: 0 },
        {
          or: [
            { field: 'title', operator: 'contains', value: 'lph' },
            { field: 'title', operator: 'eq', value: 'Unknown' },
          ],
        },
      ],
    },
    1,
  ],
])(
  'compiles nested and collection operations without broadening matches %j',
  async (where, total) => {
    const kit = await fixture();
    await save(kit, { data: articleData() });
    expect((await find(kit, { where })).total).toBe(total);
  },
);
it('structural exists includes empty containers and excludes null/missing', async () => {
  const kit = await fixture();
  await save(kit, { data: articleData({ sections: [], seo: {} }) });
  await save(kit, { data: articleData({ slug: 'null', sections: null, seo: null }) });
  expect(
    (await find(kit, { where: { field: 'sections', operator: 'exists', value: true } })).total,
  ).toBe(1);
  expect(
    (await find(kit, { where: { field: 'sections', operator: 'exists', value: false } })).total,
  ).toBe(1);
  expect(
    (await find(kit, { where: { field: 'seo', operator: 'exists', value: true } })).total,
  ).toBe(1);
});
it('policy and query field restrictions apply to totals and rejects hidden filtering', async () => {
  const kit = await fixture();
  await save(kit, { data: articleData() });
  await save(kit, { data: articleData({ title: 'Bravo', slug: 'bravo' }) });
  const query = parseQuery({
    collection: kit.registry.get('articles'),
    input: {},
    limits: kit.limits,
  });
  const result = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'articles',
      query,
      where: { field: 'slug', operator: 'eq', value: 'bravo' },
      limits: kit.limits,
    }),
  );
  expect(result.total).toBe(1);
  expect(result.rows[0]?.data['title']).toBe('Bravo');
  await expect(
    find(kit, { where: { field: 'score', operator: 'eq', value: 0 }, queryableFields: ['title'] }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
it('relation target SQL conditions honor target predicate and field query authorization', async () => {
  const kit = await fixture();
  const target = await save(kit, {
    collection: 'pages',
    data: { title: 'Visible', status: 'private' },
  });
  await save(kit, { data: articleData({ author: { collection: 'pages', id: target.id } }) });
  const query = parseQuery({
    collection: kit.registry.get('articles'),
    input: { where: { field: 'author.title', operator: 'eq', value: 'Visible' } },
    limits: kit.limits,
  });
  const run = (policy: Where | boolean, fields = ['title', 'status']) =>
    kit.database.transaction((tx) =>
      kit.store.queryDocuments(tx, {
        collection: 'articles',
        query,
        limits: kit.limits,
        relationScopes: [
          { collection: 'pages', locale: 'en', fallback: [], policy, queryableFields: fields },
        ],
      }),
    );
  expect((await run(true)).total).toBe(1);
  expect((await run({ field: 'status', operator: 'eq', value: 'public' })).total).toBe(0);
  await expect(run(true, ['status'])).rejects.toMatchObject({ code: 'forbidden' });
});
it('schema rename preserves stored values and historical decoding uses stable field identity', async () => {
  const definitions = contentDefinitions();
  const [original] = definitions;
  if (!original) throw new Error('Missing original');
  const kit = await fixture(definitions);
  const saved = await save(kit, { data: articleData() });
  const renamed: CollectionDefinition = {
    ...original,
    schemaVersion: 2,
    fields: original.fields.map((field) =>
      field.id === 'title' ? { ...field, name: 'headline' } : field,
    ),
    search: ['headline', 'sections.heading'],
    defaultSort: [{ field: 'headline', order: 'asc' }],
    previousSchemas: [original],
  };
  const registry = createRegistry({
    collections: [renamed, ...definitions.slice(1)],
    limits: kit.limits,
  });
  const mapping = compileContent(registry);
  const store = createContentStore({ mapping, limits: kit.limits });
  const data = await kit.database.transaction((tx) =>
    store.readRevisionData(tx, {
      collection: 'articles',
      documentId: saved.id,
      versionId: saved.versionId,
      locale: 'en',
    }),
  );
  expect(data['headline']).toBe('Alpha');
  expect(data['title']).toBeUndefined();
});
it('foreign version identity cannot be read or assigned as another document pointer', async () => {
  const kit = await fixture();
  const first = await save(kit, { data: articleData() });
  const second = await save(kit, { data: articleData({ slug: 'second' }) });
  await expect(
    kit.database.transaction((tx) =>
      kit.store.readRevisionData(tx, {
        collection: 'articles',
        documentId: first.id,
        versionId: second.versionId,
        locale: 'en',
      }),
    ),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.database.transaction((tx) =>
      kit.store.updateDocumentPointers(tx, {
        collection: 'articles',
        id: first.id,
        revision: 2,
        expectedRevision: 1,
        currentVersionId: second.versionId,
        publishedVersionId: null,
      }),
    ),
  ).rejects.toMatchObject({ code: '23503' });
});
it('history and reference lifecycle preserve active revisions and allow external-reference-safe purge', async () => {
  const kit = await fixture();
  const target = await save(kit, { collection: 'pages', data: { title: 'Target' } });
  const source = await save(kit, {
    data: articleData({ author: { collection: 'pages', id: target.id } }),
  });
  await kit.database.transaction((tx) =>
    kit.store.writeReferences(tx, {
      collection: 'articles',
      documentId: source.id,
      versionId: source.versionId,
      references: [
        {
          collection: 'pages',
          id: target.id,
          path: 'en:author',
          fieldId: 'author',
          onDelete: 'restrict',
          media: false,
        },
      ],
    }),
  );
  const incoming = await kit.database.transaction((tx) =>
    kit.store.inboundReferences(tx, { collection: 'pages', id: target.id, active: true, limit: 1 }),
  );
  expect(incoming).toEqual([
    {
      sourceDocumentId: source.id,
      sourceRevisionId: source.versionId,
      sourceCollectionId: 'test_articles',
      sourceCollection: 'articles',
      schemaVersion: 1,
      path: 'en:author',
      fieldId: 'author',
      onDelete: 'restrict',
      active: true,
    },
  ]);
  expect(
    await kit.database.transaction((tx) =>
      kit.store.inboundReferences(tx, {
        collection: 'pages',
        id: target.id,
        excludeDocumentId: source.id,
      }),
    ),
  ).toEqual([]);
  await expect(
    kit.database.transaction((tx) =>
      kit.store.purgeDocument(tx, { collection: 'pages', id: target.id }),
    ),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await expect(
    kit.database.transaction((tx) =>
      kit.store.removeRevision(tx, {
        collection: 'articles',
        documentId: source.id,
        versionId: source.versionId,
      }),
    ),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  const current = await save(kit, {
    id: source.id,
    data: articleData({ slug: 'next' }),
    previousVersionId: source.versionId,
  });
  const history = await kit.database.transaction((tx) =>
    kit.store.listVersions(tx, { collection: 'articles', id: source.id, page: 1, pageSize: 1 }),
  );
  expect(history.total).toBe(2);
  expect(history.rows[0]?.id).toBe(current.versionId);
  await kit.database.transaction((tx) =>
    kit.store.removeRevision(tx, {
      collection: 'articles',
      documentId: source.id,
      versionId: source.versionId,
    }),
  );
  expect(
    await kit.database.transaction((tx) =>
      kit.store.inboundReferences(tx, { collection: 'pages', id: target.id }),
    ),
  ).toEqual([]);
  await kit.database.transaction((tx) =>
    kit.store.purgeDocument(tx, { collection: 'articles', id: source.id }),
  );
  await kit.database.transaction((tx) =>
    kit.store.purgeDocument(tx, { collection: 'pages', id: target.id }),
  );
  expect((await find(kit, {})).total).toBe(0);
});
it('database CAS rejects stale metadata transitions and preserves current pointers', async () => {
  const kit = await fixture();
  const saved = await save(kit, { data: articleData() });
  await expect(
    kit.database.transaction((tx) =>
      kit.store.updateDocumentPointers(tx, {
        collection: 'articles',
        id: saved.id,
        expectedRevision: 0,
        revision: 2,
        currentVersionId: saved.versionId,
        publishedVersionId: null,
      }),
    ),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const before = await kit.database.transaction((tx) =>
    kit.store.readDocument(tx, { collection: 'articles', id: saved.id }),
  );
  expect(before.revision).toBe(1);
  await kit.database.transaction(async (tx) => {
    await kit.store.lockDocuments(tx, { ids: [] });
    await kit.store.lockDocuments(tx, { ids: [saved.id, saved.id] });
    await kit.store.updateDocumentPointers(tx, {
      collection: 'articles',
      id: saved.id,
      expectedRevision: 1,
      revision: 2,
      currentVersionId: saved.versionId,
      publishedVersionId: null,
      trashedAt: '2026-10-26T00:00:00.000Z',
      folderId: null,
    });
  });
  expect((await find(kit, {})).total).toBe(0);
  const trashed = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'articles',
      query: parseQuery({
        collection: kit.registry.get('articles'),
        input: { trashed: true, folderId: null },
        limits: kit.limits,
      }),
      limits: kit.limits,
    }),
  );
  expect(trashed.total).toBe(1);
});
it('a singleton cannot be bypassed by concurrent creates or an archived existing document', async () => {
  const definitions = contentDefinitions();
  const kit = await fixture(
    definitions.map((definition) =>
      definition.key === 'articles' ? { ...definition, singleton: true } : definition,
    ),
  );
  const results = await Promise.allSettled([
    save(kit, { data: articleData({ slug: 'one' }) }),
    save(kit, { data: articleData({ slug: 'two' }) }),
  ]);
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  const item = results.find((value) => value.status === 'fulfilled');
  if (item?.status !== 'fulfilled') throw new Error('Missing singleton');
  await kit.database.transaction((tx) =>
    kit.store.updateDocumentPointers(tx, {
      collection: 'articles',
      id: item.value.id,
      expectedRevision: 1,
      revision: 2,
      currentVersionId: item.value.versionId,
      publishedVersionId: null,
      trashedAt: '2026-10-26T00:00:00.000Z',
    }),
  );
  await expect(save(kit, { data: articleData() })).rejects.toMatchObject({
    code: 'identifier_taken',
  });
});
it('batch revision reads validate document ownership, preserve locale and avoid empty request SQL', async () => {
  const kit = await fixture();
  const first = await save(kit, { data: articleData() });
  const second = await save(kit, { data: articleData({ slug: 'second' }) });
  const items = [
    { documentId: first.id, versionId: first.versionId, locale: 'en' },
    { documentId: second.id, versionId: second.versionId, locale: 'zh-CN', fallback: ['en'] },
  ];
  const values = await kit.database.transaction((tx) =>
    kit.store.readRevisionDataBatch(tx, { collection: 'articles', items }),
  );
  expect(values.map((value) => value.data['title'])).toEqual(['Alpha', 'Alpha']);
  expect(
    await kit.database.transaction((tx) =>
      kit.store.readRevisionDataBatch(tx, { collection: 'articles', items: [] }),
    ),
  ).toEqual([]);
  await expect(
    kit.database.transaction((tx) =>
      kit.store.readRevisionDataBatch(tx, {
        collection: 'articles',
        items: [{ documentId: first.id, versionId: second.versionId, locale: 'en' }],
      }),
    ),
  ).rejects.toMatchObject({ code: 'not_found' });
});
it('query count stays exact on empty later pages and identity-only projections return no field data', async () => {
  const kit = await fixture();
  await save(kit, { data: articleData() });
  expect((await find(kit, { page: 2, pageSize: 1 })).total).toBe(1);
  const identities = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'articles',
      query: parseQuery({
        collection: kit.registry.get('articles'),
        input: { select: [], sort: [] },
        limits: kit.limits,
      }),
      limits: kit.limits,
    }),
  );
  expect(identities.rows[0]?.data).toEqual({});
  expect(identities.total).toBe(1);
});
it.each<[Where, number]>([
  [{ field: 'slug', operator: 'ne', value: 'else' }, 1],
  [{ field: 'slug', operator: 'in', value: ['alpha'] }, 1],
  [{ field: 'slug', operator: 'notIn', value: ['alpha'] }, 0],
  [{ field: 'score', operator: 'lt', value: 1 }, 1],
  [{ field: 'score', operator: 'lte', value: 0 }, 1],
  [{ field: 'score', operator: 'gt', value: 1 }, 0],
  [{ field: 'extra', operator: 'contains', value: { nested: ['value'] } }, 1],
  [{ field: 'seo.description', operator: 'exists', value: false }, 0],
  [{ field: 'revision', operator: 'eq', value: 1 }, 1],
  [{ field: 'folderId', operator: 'eq', value: null }, 1],
  [{ field: 'createdAt', operator: 'gt', value: '2026-01-01T00:00:00Z' }, 1],
])('SQL comparison evaluates independent expected results %j', async (where, total) => {
  const kit = await fixture();
  await save(kit, { data: articleData() });
  expect((await find(kit, { where })).total).toBe(total);
});
it.each<Where>([
  { field: 'missing', operator: 'eq', value: 1 },
  { field: 'score', operator: 'contains', value: '0' },
  { field: 'score', operator: 'in', value: [] },
  { field: 'score', operator: 'in', value: 'bad' },
  { field: 'score', operator: 'exists', value: 'true' },
  { field: 'enabled', operator: 'gt', value: true },
  { field: 'id', operator: 'eq', value: 'not-id' },
  { field: 'revision', operator: 'eq', value: 0 },
  { field: 'createdAt', operator: 'eq', value: 'not-date' },
  { field: 'score', operator: 'contains', value: 1 },
  { field: 'score', operator: 'gt', value: 'one' },
])('invalid typed query cannot reach ambiguous SQL semantics %j', async (where) => {
  const kit = await fixture();
  await expect(find(kit, { where })).rejects.toMatchObject({ code: 'invalid_input' });
});
it('missing schema manifest and missing physical column fail readiness', async () => {
  const kit = await fixture();
  await kit.database.query('DELETE FROM content_schema_manifests');
  await expect(kit.database.transaction((tx) => kit.store.verifyReady(tx))).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  await kit.database.query('INSERT INTO content_schema_manifests(fingerprint,plan) VALUES($1,$2)', [
    kit.mapping.fingerprint,
    kit.mapping.plan,
  ]);
  const field = kit.mapping.get('articles').flat.find((mapping) => mapping.path === 'score');
  if (!field) throw new Error('Missing score');
  await kit.database.query(`ALTER TABLE "${field.table}" DROP COLUMN value`);
  await expect(kit.database.transaction((tx) => kit.store.verifyReady(tx))).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});
it('declared compound indexes are real typed projections used by filters and sorting', async () => {
  const kit = await fixture(
    contentDefinitions().map((definition) =>
      definition.key === 'articles'
        ? { ...definition, indexes: [{ id: 'score_enabled', fields: ['score', 'enabled'] }] }
        : definition,
    ),
  );
  const first = await save(kit, { data: articleData({ score: 20, enabled: false }) });
  await save(kit, { data: articleData({ slug: 'other', score: 10, enabled: true }) });
  const [index] = kit.mapping.get('articles').indexes;
  if (!index) throw new Error('Missing compiled index');
  const catalog = await kit.database.query<{ indexdef: string }>(
    'SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1',
    [index.table],
  );
  expect(catalog.rows.some((row) => row.indexdef.includes('(locale, k0, k1, revision_id)'))).toBe(
    true,
  );
  const fields = await kit.database.query<{ column_name: string; data_type: string }>(
    'SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position',
    [index.table],
  );
  expect(fields.rows).toContainEqual({ column_name: 'k0', data_type: 'double precision' });
  expect(fields.rows).toContainEqual({ column_name: 'k1', data_type: 'boolean' });
  const result = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'articles',
      query: parseQuery({
        collection: kit.registry.get('articles'),
        input: {
          where: {
            and: [
              { field: 'score', operator: 'eq', value: 20 },
              { field: 'enabled', operator: 'eq', value: false },
            ],
          },
          sort: [
            { field: 'score', order: 'desc' },
            { field: 'enabled', order: 'asc' },
          ],
          select: [],
        },
        limits: kit.limits,
      }),
      limits: kit.limits,
    }),
  );
  expect(result.rows.map((row) => row.document.id)).toEqual([first.id]);
  await kit.database.query(`UPDATE "${index.table}" SET k0=21 WHERE revision_id=$1`, [
    first.versionId,
  ]);
  expect((await find(kit, { where: { field: 'score', operator: 'eq', value: 20 } })).total).toBe(0);
  expect((await find(kit, { where: { field: 'score', operator: 'eq', value: 21 } })).total).toBe(1);
});
it('q uses generated GIN text-search vectors while contains keeps substring semantics', async () => {
  const kit = await fixture();
  await save(kit, { data: articleData({ title: 'Alpha Wave' }) });
  await save(kit, { data: articleData({ title: 'Alphabet', slug: 'alphabet', sections: [] }) });
  const query = (q: string) =>
    kit.database.transaction((tx) =>
      kit.store.queryDocuments(tx, {
        collection: 'articles',
        query: parseQuery({
          collection: kit.registry.get('articles'),
          input: { q },
          limits: kit.limits,
        }),
        limits: kit.limits,
      }),
    );
  expect((await query('Alpha')).total).toBe(1);
  expect((await query('"Alpha Wave"')).total).toBe(1);
  expect(
    (await find(kit, { where: { field: 'title', operator: 'contains', value: 'Alpha' } })).total,
  ).toBe(2);
  const title = kit.mapping.get('articles').flat.find((field) => field.path === 'title');
  if (!title) throw new Error('Missing title');
  const indexes = await kit.database.query<{ indexdef: string }>(
    'SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1',
    [title.table],
  );
  expect(indexes.rows.some((row) => row.indexdef.includes('USING gin (search_vector)'))).toBe(true);
});
it('trusted policy can constrain hidden fields while client filters still cannot probe them', async () => {
  const kit = await fixture();
  await save(kit, { data: articleData() });
  const query = parseQuery({
    collection: kit.registry.get('articles'),
    input: { policy: { field: 'slug', operator: 'eq', value: 'alpha' } },
    limits: kit.limits,
  });
  const result = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'articles',
      query,
      queryableFields: ['title'],
      limits: kit.limits,
    }),
  );
  expect(result.total).toBe(1);
  await expect(
    find(kit, {
      where: { field: 'slug', operator: 'eq', value: 'alpha' },
      queryableFields: ['title'],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
it('nested arrays within the document budget do not overflow PostgreSQL bind parameters', async () => {
  const kit = await fixture();
  const sections = Array.from({ length: 100 }, (_outer, outer) => ({
    id: randomUUID(),
    heading: `Group ${outer}`,
    items: Array.from({ length: 100 }, (_inner, inner) => ({
      id: randomUUID(),
      label: `${outer}:${inner}`,
    })),
  }));
  const data = articleData({ sections });
  expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThan(kit.limits.maxDataBytes);
  const saved = await save(kit, { data });
  const decoded = await kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'articles',
      documentId: saved.id,
      versionId: saved.versionId,
      locale: 'en',
    }),
  );
  expect(decoded['sections']).toEqual(sections);
});
it('resource union pagination orders/counts only authorized collection rows with bounded page hydration', async () => {
  const kit = await fixture();
  const first = await save(kit, { data: articleData() });
  const second = await save(kit, {
    collection: 'pages',
    data: { title: 'Page', status: 'public' },
  });
  await save(kit, { data: articleData({ slug: 'hidden' }) });
  const collections = [
    {
      collection: 'articles',
      query: parseQuery({
        collection: kit.registry.get('articles'),
        input: { policy: { field: 'slug', operator: 'eq', value: 'alpha' } },
        limits: kit.limits,
      }),
    },
    {
      collection: 'pages',
      query: parseQuery({ collection: kit.registry.get('pages'), input: {}, limits: kit.limits }),
    },
  ];
  const run = (page: number) =>
    kit.database.transaction((tx) =>
      kit.store.queryCollections(tx, {
        collections,
        page,
        pageSize: 1,
        sort: [{ field: 'createdAt', order: 'asc' }],
        limits: kit.limits,
      }),
    );
  const one = await run(1);
  const two = await run(2);
  const beyond = await run(3);
  expect(one.total).toBe(2);
  expect(one.rows[0]?.document.id).toBe(first.id);
  expect(two.rows[0]?.document.id).toBe(second.id);
  expect(two.rows[0]?.data['title']).toBe('Page');
  expect(beyond.total).toBe(2);
  expect(beyond.rows).toEqual([]);
  expect(
    await kit.database.transaction((tx) =>
      kit.store.queryCollections(tx, {
        collections: [],
        page: 1,
        pageSize: 20,
        sort: [],
        limits: kit.limits,
      }),
    ),
  ).toEqual({ rows: [], total: 0, page: 1, pageSize: 20 });
  await expect(
    kit.database.transaction((tx) =>
      kit.store.queryCollections(tx, {
        collections,
        page: 1,
        pageSize: 1,
        sort: [{ field: 'title', order: 'asc' }],
        limits: kit.limits,
      }),
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
it('retention finds old deep revisions beyond a fresh first window without exceeding public page size', async () => {
  const kit = await fixture();
  const created = await save(kit, { data: articleData() });
  let current = created;
  for (let index = 0; index < 5; index += 1)
    current = await save(kit, {
      id: current.id,
      data: articleData({ slug: `revision-${index}` }),
      previousVersionId: current.versionId,
    });
  await kit.database.query(
    "UPDATE content_revisions SET created_at='2020-01-01T00:00:00Z' WHERE id=$1",
    [created.versionId],
  );
  const prunable = await kit.database.transaction((tx) =>
    kit.store.listPrunableVersions(tx, {
      collection: 'articles',
      id: created.id,
      protectedIds: [current.versionId],
      keepLatest: 1,
      olderThan: '2021-01-01T00:00:00Z',
      limit: 1,
    }),
  );
  expect(prunable.map((version) => version.id)).toEqual([created.versionId]);
  const protectedRows = await kit.database.transaction((tx) =>
    kit.store.listPrunableVersions(tx, {
      collection: 'articles',
      id: created.id,
      protectedIds: [created.versionId, current.versionId],
      keepLatest: 1,
      olderThan: '2021-01-01T00:00:00Z',
      limit: 1,
    }),
  );
  expect(protectedRows).toEqual([]);
});
it('coordinate uniqueness compares whole points rather than individual shared coordinates', async () => {
  const kit = await fixture(
    contentDefinitions().map((definition) =>
      definition.key === 'articles'
        ? {
            ...definition,
            fields: definition.fields.map((field) =>
              field.id === 'location' ? { ...field, unique: true } : field,
            ),
          }
        : definition,
    ),
  );
  await save(kit, { data: articleData({ location: [1, 2] }) });
  await expect(
    save(kit, { data: articleData({ slug: 'different', location: [1, 3] }) }),
  ).resolves.toHaveProperty('id');
  await expect(
    save(kit, { data: articleData({ slug: 'duplicate', location: [1, 2] }) }),
  ).rejects.toMatchObject({ code: '23505' });
});
