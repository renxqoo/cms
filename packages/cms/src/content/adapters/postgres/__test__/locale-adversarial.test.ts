import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../../../test/support/database.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import { createRegistry, generateArtifacts } from '../../../generate.ts';
import type {
  CollectionDefinition,
  DocumentData,
  FieldDefinition,
  Where,
} from '../../../definition.ts';
import { parseQuery } from '../../../queries/parse-query.ts';
import { validateData } from '../../../fields/validate-data.ts';
import { createContentStore } from '../store.ts';
import type { RelationScope } from '../../../model.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0)) await resource.close();
});
const locales = { default: 'en', supported: ['en', 'zh'], fallback: { zh: ['en'] } };
function collection(fields: readonly FieldDefinition[], indexed = false): CollectionDefinition {
  return {
    id: 'locale_contract',
    key: 'items',
    label: 'Items',
    schemaVersion: 1,
    mode: 'direct',
    history: false,
    locales,
    fields,
    ...(indexed ? { indexes: [{ id: 'group_label', fields: ['group.label'] }] } : {}),
  };
}
async function fixture(definition: CollectionDefinition, others: CollectionDefinition[] = []) {
  const kit = await createTestDatabase({ migrationScope: 'library' });
  resources.push(kit);
  const limits = contentLimits();
  const registry = createRegistry({ collections: [definition, ...others], limits });
  const artifacts = generateArtifacts(registry);
  await kit.database.query(artifacts.sql);
  const actorId = randomUUID();
  await kit.database.query(
    "INSERT INTO admins(id,email,role_id) SELECT $1,'locale-review@example.test',id FROM roles WHERE is_super",
    [actorId],
  );
  const store = createContentStore({ mapping: artifacts.mapping, limits });
  return { ...kit, definition, registry, limits, store, actorId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function polymorphicFixture() {
  const source = collection([
    { id: 'link', name: 'link', type: 'relationship', relationTo: ['leaves', 'branches'] },
  ]);
  const leaves: CollectionDefinition = {
    ...collection([
      { id: 'label', name: 'label', type: 'text' },
      { id: 'status', name: 'status', type: 'text' },
    ]),
    id: 'polymorphic_leaves',
    key: 'leaves',
  };
  const branches: CollectionDefinition = {
    ...collection([
      { id: 'author', name: 'author', type: 'relationship', relationTo: ['leaves'] },
      { id: 'label', name: 'label', type: 'number' },
    ]),
    id: 'polymorphic_branches',
    key: 'branches',
  };
  const kit = await fixture(source, [leaves, branches]);
  const leaf = await save(kit, { en: { label: 'Bonjour', status: 'public' } }, 'leaves');
  const branch = await save(
    kit,
    { en: { label: 7, author: { collection: 'leaves', id: leaf.id } } },
    'branches',
  );
  const direct = await save(kit, { en: { link: { collection: 'leaves', id: leaf.id } } });
  const indirect = await save(kit, { en: { link: { collection: 'branches', id: branch.id } } });
  const scopes: RelationScope[] = [
    {
      collection: 'leaves',
      locale: 'en',
      fallback: [],
      policy: true,
      queryableFields: ['label', 'status'],
    },
    {
      collection: 'branches',
      locale: 'en',
      fallback: [],
      policy: true,
      queryableFields: ['author', 'label'],
    },
  ];
  return { ...kit, direct, indirect, scopes };
}

function polymorphicQuery(
  kit: Awaited<ReturnType<typeof polymorphicFixture>>,
  where: Where,
  scopes: readonly RelationScope[] = kit.scopes,
) {
  return kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'items',
      limits: kit.limits,
      query: parseQuery({ collection: kit.definition, input: { where }, limits: kit.limits }),
      relationScopes: scopes,
    }),
  );
}

it('nested polymorphic queries match the complete multi-hop path without rejecting targets that lack it', async () => {
  const kit = await polymorphicFixture();
  const result = await polymorphicQuery(kit, {
    field: 'link.author.label',
    operator: 'eq',
    value: 'Bonjour',
  });
  expect(result.total).toBe(1);
  expect(result.rows.map((row) => row.document.id)).toEqual([kit.indirect.id]);
  const absent = await polymorphicQuery(kit, {
    field: 'link.author.label',
    operator: 'exists',
    value: false,
  });
  expect(absent.total).toBe(0);
});

it('nested negative filters exclude empty or structurally missing chains while accepting a missing terminal value', async () => {
  const kit = await polymorphicFixture();
  const emptyLeaf = await save(kit, { en: { status: 'public' } }, 'leaves');
  const linked = await save(
    kit,
    { en: { author: { collection: 'leaves', id: emptyLeaf.id } } },
    'branches',
  );
  const missingLeaf = await save(kit, {
    en: { link: { collection: 'branches', id: linked.id } },
  });
  const emptyBranch = await save(kit, { en: {} }, 'branches');
  await save(kit, { en: { link: { collection: 'branches', id: emptyBranch.id } } });
  await save(kit, { en: {} });
  for (const where of [
    { field: 'link.author.label', operator: 'ne', value: 'Bonjour' },
    { field: 'link.author.label', operator: 'notIn', value: ['Bonjour'] },
    { field: 'link.author.label', operator: 'exists', value: false },
  ] satisfies Where[]) {
    const result = await polymorphicQuery(kit, where);
    expect(result.total).toBe(1);
    expect(result.rows.map((row) => row.document.id)).toEqual([missingLeaf.id]);
    const denied = await polymorphicQuery(
      kit,
      where,
      kit.scopes.map((scope) =>
        scope.collection === 'leaves' ? { ...scope, policy: false, queryableFields: [] } : scope,
      ),
    );
    expect(denied.total).toBe(0);
    expect(denied.rows).toEqual([]);
  }
});

it('polymorphic queries reject paths absent from every target even when all targets are unreadable', async () => {
  const kit = await polymorphicFixture();
  for (const scopes of [
    kit.scopes,
    kit.scopes.map((scope) => ({ ...scope, policy: false, queryableFields: [] })),
  ])
    await expect(
      polymorphicQuery(
        kit,
        { field: 'link.author.missing', operator: 'eq', value: 'Bonjour' },
        scopes,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('a complete polymorphic path cannot hide a denied query field or incompatible scalar branch', async () => {
  const kit = await polymorphicFixture();
  for (const collectionKey of ['branches', 'leaves'])
    await expect(
      polymorphicQuery(
        kit,
        { field: 'link.author.label', operator: 'eq', value: 'Bonjour' },
        kit.scopes.map((scope) =>
          scope.collection === collectionKey ? { ...scope, queryableFields: [] } : scope,
        ),
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    polymorphicQuery(kit, { field: 'link.label', operator: 'eq', value: 'Bonjour' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('unreadable polymorphic targets and target predicates never contribute rows or totals', async () => {
  const kit = await polymorphicFixture();
  const where: Where = { field: 'link.author.label', operator: 'eq', value: 'Bonjour' };
  for (const collectionKey of ['branches', 'leaves']) {
    const result = await polymorphicQuery(
      kit,
      where,
      kit.scopes.map((scope) =>
        scope.collection === collectionKey
          ? { ...scope, policy: false, queryableFields: [] }
          : scope,
      ),
    );
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  }
  const result = await polymorphicQuery(
    kit,
    where,
    kit.scopes.map((scope) =>
      scope.collection === 'leaves'
        ? { ...scope, policy: { field: 'status', operator: 'eq', value: 'private' } }
        : scope,
    ),
  );
  expect(result.total).toBe(0);
  expect(result.rows).toEqual([]);
  const direct = await polymorphicQuery(
    kit,
    { field: 'link.label', operator: 'eq', value: 'Bonjour' },
    kit.scopes.map((scope) =>
      scope.collection === 'branches' ? { ...scope, policy: false, queryableFields: [] } : scope,
    ),
  );
  expect(direct.total).toBe(1);
  expect(direct.rows.map((row) => row.document.id)).toEqual([kit.direct.id]);
});

it('cyclic polymorphic paths reject an over-budget unknown leaf before exhausting mapping lookups', async () => {
  const link = {
    id: 'link',
    name: 'link',
    type: 'relationship' as const,
    relationTo: ['items', 'branches'],
  };
  const kit = await fixture(collection([link]), [
    { ...collection([link]), id: 'cyclic_branches', key: 'branches' },
  ]);
  const limits = contentLimits({ maxQueryDepth: 3, maxQueryNodes: 8 });
  const { mapping } = generateArtifacts(kit.registry);
  let lookups = 0;
  const store = createContentStore({
    limits,
    mapping: {
      ...mapping,
      get(key, version) {
        lookups += 1;
        if (lookups > limits.maxQueryNodes * 2) throw new Error('Mapping budget exhausted');
        return mapping.get(key, version);
      },
    },
  });
  await expect(
    kit.database.transaction((tx) =>
      store.queryDocuments(tx, {
        collection: 'items',
        limits,
        query: parseQuery({
          collection: kit.definition,
          limits,
          input: { where: { field: `${'link.'.repeat(40)}missing`, operator: 'eq', value: 1 } },
        }),
      }),
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('valid polymorphic expansion and target policies share the request compilation budget', async () => {
  const fields = [
    {
      id: 'link',
      name: 'link',
      type: 'relationship' as const,
      relationTo: ['items', 'branches'],
    },
    { id: 'title', name: 'title', type: 'text' as const },
  ];
  const kit = await fixture(collection(fields), [
    { ...collection(fields), id: 'cyclic_branches', key: 'branches' },
  ]);
  const limits = contentLimits({ maxQueryDepth: 8, maxQueryNodes: 8 });
  const { mapping } = generateArtifacts(kit.registry);
  let lookups = 0;
  const store = createContentStore({
    limits,
    mapping: {
      ...mapping,
      get(key, version) {
        lookups += 1;
        if (lookups > limits.maxQueryNodes * limits.maxQueryDepth)
          throw new Error('Mapping budget exhausted');
        return mapping.get(key, version);
      },
    },
  });
  const scopes: RelationScope[] = ['items', 'branches'].map((key) => ({
    collection: key,
    locale: 'en',
    fallback: [],
    policy: true,
    queryableFields: ['link', 'title'],
  }));
  for (const input of [
    { field: `${'link.'.repeat(7)}title`, scopes },
    {
      field: 'link.title',
      scopes: scopes.map((scope) => ({
        ...scope,
        policy: {
          and: [
            { field: 'title', operator: 'eq', value: 'Wanted' },
            { field: 'title', operator: 'contains', value: 'Want' },
            { field: 'title', operator: 'exists', value: true },
          ],
        } satisfies Where,
      })),
    },
  ]) {
    lookups = 0;
    await expect(
      kit.database.transaction((tx) =>
        store.queryDocuments(tx, {
          collection: 'items',
          limits,
          query: parseQuery({
            collection: kit.definition,
            limits,
            input: { where: { field: input.field, operator: 'eq', value: 'Wanted' } },
          }),
          relationScopes: input.scopes,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  }
  lookups = 0;
  const where: Where = {
    and: [
      { field: 'title', operator: 'eq', value: 'Wanted' },
      { field: 'title', operator: 'contains', value: 'Want' },
      { field: 'title', operator: 'exists', value: true },
      { field: 'title', operator: 'ne', value: 'Other' },
    ],
  };
  await expect(
    kit.database.transaction((tx) =>
      store.queryCollections(tx, {
        limits,
        collections: ['items', 'branches'].map((key) => ({
          collection: key,
          query: parseQuery({ collection: kit.registry.get(key), limits, input: { where } }),
        })),
        page: 1,
        pageSize: 10,
        sort: [],
      }),
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

async function save(
  kit: Fixture,
  dataByLocale: Readonly<Record<string, DocumentData>>,
  collectionKey = 'items',
) {
  const id = randomUUID();
  const versionId = randomUUID();
  const definition = kit.registry.get(collectionKey);
  const defaultLocale = definition.locales.default;
  const normalized = Object.fromEntries(
    Object.entries(dataByLocale).map(([locale, data]) => [
      locale,
      validateData({ collection: definition, data, locale, mode: 'draft', limits: kit.limits }),
    ]),
  );
  await kit.database.transaction(async (tx) => {
    await kit.store.insertDocument(tx, { collection: collectionKey, id, actorId: kit.actorId });
    await kit.store.insertRevision(tx, {
      collection: collectionKey,
      documentId: id,
      id: versionId,
      revision: 1,
      schemaVersion: 1,
      actorId: kit.actorId,
      kind: 'save',
      locale: defaultLocale,
      data: normalized[defaultLocale] ?? {},
      dataByLocale: normalized,
    });
    await kit.store.updateDocumentPointers(tx, {
      collection: collectionKey,
      id,
      revision: 1,
      expectedRevision: 0,
      currentVersionId: versionId,
      publishedVersionId: versionId,
    });
  });
  return { id, versionId };
}
function read(kit: Fixture, saved: { id: string; versionId: string }) {
  return kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'items',
      documentId: saved.id,
      versionId: saved.versionId,
      locale: 'zh',
      fallback: ['en'],
    }),
  );
}
function find(kit: Fixture, where: Where) {
  return kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      collection: 'items',
      limits: kit.limits,
      query: parseQuery({
        collection: kit.definition,
        limits: kit.limits,
        input: {
          locale: 'zh',
          fallback: ['en'],
          where,
        },
      }),
    }),
  );
}

it.each([false, true])(
  'localized parent null or empty blocks fallback in reads, filters and totals (typed index=%s)',
  async (indexed) => {
    const kit = await fixture(
      collection(
        [
          {
            id: 'group',
            name: 'group',
            type: 'group',
            localized: true,
            fields: [{ id: 'label', name: 'label', type: 'text' }],
          },
        ],
        indexed,
      ),
    );
    const nullParent = await save(kit, {
      en: { group: { label: 'English child' } },
      zh: { group: null },
    });
    const emptyParent = await save(kit, {
      en: { group: { label: 'English child' } },
      zh: { group: {} },
    });
    const missingParent = await save(kit, { en: { group: { label: 'English child' } } });
    expect(await read(kit, nullParent)).toEqual({ group: null });
    expect(await read(kit, emptyParent)).toEqual({ group: {} });
    expect(await read(kit, missingParent)).toEqual({ group: { label: 'English child' } });
    const positive = await find(kit, {
      field: 'group.label',
      operator: 'eq',
      value: 'English child',
    });
    expect(positive.total).toBe(1);
    expect(positive.rows.map((row) => row.document.id)).toEqual([missingParent.id]);
    expect(positive.rows.map((row) => row.data)).toEqual([{ group: { label: 'English child' } }]);
    const missing = await find(kit, { field: 'group.label', operator: 'exists', value: false });
    expect(missing.total).toBe(2);
    expect(missing.rows.map((row) => row.document.id).toSorted()).toEqual(
      [nullParent.id, emptyParent.id].toSorted(),
    );
  },
);

function nestedDefinition(): CollectionDefinition {
  return collection([
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'row_label', name: 'label', type: 'text', localized: true },
        {
          id: 'nested',
          name: 'nested',
          type: 'array',
          fields: [{ id: 'nested_label', name: 'label', type: 'text', localized: true }],
        },
      ],
    },
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'paragraph',
          key: 'paragraph',
          label: 'Paragraph',
          fields: [{ id: 'block_label', name: 'label', type: 'text', localized: true }],
        },
      ],
    },
  ]);
}
it('nonlocalized arrays and blocks preserve explicit fallback for localized descendants', async () => {
  const kit = await fixture(nestedDefinition());
  const data = {
    rows: [
      {
        id: randomUUID(),
        label: 'Row English',
        nested: [{ id: randomUUID(), label: 'Nested English' }],
      },
    ],
    blocks: [{ id: randomUUID(), blockType: 'paragraph', label: 'Block English' }],
  };
  const saved = await save(kit, { en: data });
  expect(await read(kit, saved)).toEqual(data);
  for (const [field, value] of [
    ['rows.label', 'Row English'],
    ['rows.nested.label', 'Nested English'],
    ['blocks.label', 'Block English'],
  ]) {
    if (!field || !value) throw new Error('Missing independent query example');
    const page = await find(kit, { field, operator: 'eq', value });
    expect(page.total).toBe(1);
    expect(page.rows.map((row) => row.data)).toEqual([data]);
  }
});

it('relation filters and target predicates use the authorized target locale when source locale is unsupported', async () => {
  const source = {
    ...collection([
      { id: 'target', name: 'target', type: 'relationship', relationTo: ['targets'] },
    ]),
    locales: { default: 'en', supported: ['en'], fallback: {} },
  };
  const target: CollectionDefinition = {
    ...collection([
      { id: 'title', name: 'title', type: 'text', localized: true },
      { id: 'status', name: 'status', type: 'text', localized: true },
    ]),
    id: 'target_locale_contract',
    key: 'targets',
    locales: { default: 'fr', supported: ['fr'], fallback: {} },
  };
  const kit = await fixture(source, [target]);
  const targetSaved = await save(kit, { fr: { title: 'Bonjour', status: 'public' } }, 'targets');
  const sourceSaved = await save(kit, {
    en: { target: { collection: 'targets', id: targetSaved.id } },
  });
  const options = {
    collection: 'items',
    limits: kit.limits,
    query: parseQuery({
      collection: source,
      limits: kit.limits,
      input: {
        where: { field: 'target.title', operator: 'eq', value: 'Bonjour' },
      },
    }),
    relationScopes: [
      {
        collection: 'targets',
        locale: 'fr',
        fallback: [],
        policy: { field: 'status', operator: 'eq', value: 'public' } satisfies Where,
        queryableFields: ['title', 'status'],
      },
    ],
  };
  const page = await kit.database.transaction((tx) => kit.store.queryDocuments(tx, options));
  expect(page.total).toBe(1);
  expect(page.rows.map((row) => row.document.id)).toEqual([sourceSaved.id]);
  const targetRead = await kit.database.transaction((tx) =>
    kit.store.readRevisionData(tx, {
      collection: 'targets',
      documentId: targetSaved.id,
      versionId: targetSaved.versionId,
      locale: 'fr',
    }),
  );
  expect(targetRead).toEqual({ title: 'Bonjour', status: 'public' });
  const denied = await kit.database.transaction((tx) =>
    kit.store.queryDocuments(tx, {
      ...options,
      relationScopes: options.relationScopes.map((scope) => ({ ...scope, policy: false })),
    }),
  );
  expect(denied.total).toBe(0);
  await expect(
    kit.database.transaction((tx) =>
      kit.store.queryDocuments(tx, {
        ...options,
        relationScopes: options.relationScopes.map((scope) => ({
          ...scope,
          queryableFields: ['status'],
        })),
      }),
    ),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
it('typed storage and indexes do not synthesize missing prototype-method fields from object inheritance', async () => {
  const definition: CollectionDefinition = {
    ...collection([{ id: 'method_name', name: 'toString', type: 'text', localized: true }]),
    indexes: [{ id: 'method_index', fields: ['toString'] }],
  };
  const kit = await fixture(definition);
  const missing = await save(kit, { en: {} });
  const present = await save(kit, { en: { toString: 'Explicit text' } });
  expect(await read(kit, missing)).toEqual({});
  const absent = await find(kit, { field: 'toString', operator: 'exists', value: false });
  expect(absent.total).toBe(1);
  expect(absent.rows.map((row) => row.document.id)).toEqual([missing.id]);
  const explicit = await find(kit, { field: 'toString', operator: 'eq', value: 'Explicit text' });
  expect(explicit.total).toBe(1);
  expect(explicit.rows.map((row) => row.document.id)).toEqual([present.id]);
});
it('localized null descendants stop fallback beneath nonlocalized arrays and blocks', async () => {
  const kit = await fixture(nestedDefinition());
  const rowId = randomUUID(),
    nestedId = randomUUID(),
    blockId = randomUUID();
  const translated = {
    rows: [{ id: rowId, label: null, nested: [{ id: nestedId, label: null }] }],
    blocks: [{ id: blockId, blockType: 'paragraph', label: null }],
  };
  const saved = await save(kit, {
    en: {
      rows: [
        { id: rowId, label: 'Row English', nested: [{ id: nestedId, label: 'Nested English' }] },
      ],
      blocks: [{ id: blockId, blockType: 'paragraph', label: 'Block English' }],
    },
    zh: translated,
  });
  expect(await read(kit, saved)).toEqual(translated);
  for (const field of ['rows.label', 'rows.nested.label', 'blocks.label']) {
    expect((await find(kit, { field, operator: 'contains', value: 'English' })).total).toBe(0);
    expect((await find(kit, { field, operator: 'exists', value: false })).total).toBe(1);
  }
});
