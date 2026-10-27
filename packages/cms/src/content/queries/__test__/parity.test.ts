import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import type { Where } from '../../definition.ts';
import type { CollectionDefinition } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(defaultSort?: CollectionDefinition['defaultSort']) {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  if (defaultSort) article.defaultSort = defaultSort;
  article.fields = [
    ...article.fields,
    { id: 'tags', name: 'tags', type: 'select', options: ['red', 'blue', 'green'], hasMany: true },
    { id: 'location', name: 'location', type: 'point' },
    { id: 'backup', name: 'backup', type: 'point' },
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: {
        read: { version: '1', run: ({ actor }) => actor.role.isSuper },
        query: { version: '1', run: ({ actor }) => actor.role.isSuper },
      },
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it.each([
  {
    sort: [{ field: 'secret', order: 'asc' as const }],
    expected: [{ field: 'updatedAt', order: 'desc' }],
  },
  {
    sort: [
      { field: 'secret', order: 'asc' as const },
      { field: 'score', order: 'desc' as const },
    ],
    expected: [{ field: 'score', order: 'desc' }],
  },
])(
  'projects only queryable sortable defaults and falls back when every configured field is hidden: $sort',
  async ({ sort, expected }) => {
    const kit = await fixture(sort);
    const owner = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
    expect(owner.defaultSort).toEqual(sort);
    expect(owner.fields.find((field) => field.path === 'tags')?.sortable).toBe(false);
    expect(owner.fields.find((field) => field.path === 'title')?.sortable).toBe(true);
    const editor = await contentActor(kit, ['articles:collections.get']);
    const safe = await kit.content.api.getCollection(editor.ctx(), { collection: 'articles' });
    expect(safe.defaultSort).toEqual(expected);
    expect(safe.fields.some((field) => field.path === 'secret')).toBe(false);
  },
);

it('finds every requested array value and every case-insensitive word while treating wildcards literally', async () => {
  const kit = await fixture();
  const { api } = kit.content;
  const first = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'RED Alpha', tags: ['red', 'blue'] },
  });
  const second = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Blue Alpha', tags: ['blue'] },
  });
  const third = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Literal_%', tags: ['green'] },
  });
  for (const [where, ids] of [
    [{ field: 'tags', operator: 'all', value: ['red', 'blue'] }, [first.id]],
    [{ field: 'title', operator: 'like', value: 'alpha red' }, [first.id]],
    [{ field: 'title', operator: 'notLike', value: 'alpha red' }, [second.id, third.id]],
    [{ field: 'title', operator: 'like', value: '_%' }, [third.id]],
  ] as [Where, string[]][]) {
    const result = await api.listDocuments(kit.owner(), { collection: 'articles', where });
    expect(result.rows.map((row) => row.id).toSorted()).toEqual(ids.toSorted());
    expect(result.total).toBe(ids.length);
  }
  for (const where of [
    { field: 'tags', operator: 'all', value: [] },
    { field: 'score', operator: 'like', value: '0' },
    { field: 'title', operator: 'like', value: '  ' },
  ])
    await expect(
      api.listDocuments(kit.owner(), { collection: 'articles', where }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('queries point distance bounds, polygon holes and strict versus intersecting boundaries in PostgreSQL', async () => {
  const kit = await fixture();
  const { api } = kit.content;
  const origin = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Origin', location: [0, 0] },
  });
  const inside = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Inside', location: [0.5, 0.5] },
  });
  const boundary = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Boundary', location: [1, 0] },
  });
  await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Outside', location: [3, 3] },
  });
  const area = {
    type: 'Polygon',
    coordinates: [
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [-1, -1],
      ],
      [
        [-0.1, -0.1],
        [0.1, -0.1],
        [0.1, 0.1],
        [-0.1, 0.1],
        [-0.1, -0.1],
      ],
    ],
  };
  for (const [operator, value, ids] of [
    ['near', [0, 0, 100_000, null], [origin.id, inside.id]],
    ['near', [0, 0, 100_000, 50_000], [inside.id]],
    ['within', area, [inside.id]],
    ['intersects', area, [inside.id, boundary.id]],
    ['within', { type: 'MultiPolygon', coordinates: [area.coordinates] }, [inside.id]],
    [
      'intersects',
      {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 0],
        ],
      },
      [origin.id, boundary.id],
    ],
    ['within', { type: 'Point', coordinates: [0, 0] }, [origin.id]],
  ] as const) {
    const result = await api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'location', operator, value },
    });
    expect(result.rows.map((row) => row.id).toSorted()).toEqual([...ids].toSorted());
    expect(result.total).toBe(ids.length);
  }
  for (const value of [
    [0, 91, 100, null],
    [0, 0, null, null],
    [0, 0, 5, 6],
    [0, 0, -1, null],
  ])
    await expect(
      api.listDocuments(kit.owner(), {
        collection: 'articles',
        where: { field: 'location', operator: 'near', value },
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: {
        field: 'location',
        operator: 'within',
        value: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          ],
        },
      },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('regression: near filters use WGS84 meridian distance and retain Payload planar sorting even with explicit sort', async () => {
  const kit = await fixture();
  const { api } = kit.content;
  const north = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'North', location: [0, 1] },
  });
  await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'East', location: [1, 0] },
  });
  const filtered = await api.listDocuments(kit.owner(), {
    collection: 'articles',
    where: { field: 'location', operator: 'near', value: [0, 0, 111000, null] },
  });
  expect(filtered.rows.map((row) => row.id)).toEqual([north.id]);
  const east = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A nearer on ellipsoid', location: [1, 80], backup: [0.1, 80] },
  });
  const south = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Z nearer on plane', location: [0, 79.5], backup: [0.4, 80] },
  });
  for (const sort of [undefined, [{ field: 'title', order: 'asc' }]]) {
    const result = await api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'location', operator: 'near', value: [0, 80, 100000, null] },
      ...(sort ? { sort } : {}),
    });
    expect(result.rows.map((row) => row.id)).toEqual([south.id, east.id]);
  }
  const last = await api.listDocuments(kit.owner(), {
    collection: 'articles',
    where: {
      and: [
        { field: 'location', operator: 'near', value: [0, 80, 100000, null] },
        { field: 'backup', operator: 'near', value: [0, 80, 100000, null] },
      ],
    },
  });
  expect(last.rows.map((row) => row.id)).toEqual([east.id, south.id]);
});

it('regression: query preset authorization and eligibility use the selected content locale', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  article.fields = [
    ...article.fields,
    {
      id: 'regional',
      name: 'regional',
      type: 'text',
      localized: true,
      access: {
        read: { version: '1', run: ({ locale }) => locale === 'zh' },
        query: { version: '1', run: ({ locale }) => locale === 'zh' },
      },
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const presetQuery = {
    q: '',
    sort: [{ field: 'regional', order: 'asc' }],
    columns: ['regional'],
    where: { field: 'regional', operator: 'eq', value: '内容' },
  };
  await expect(
    kit.content.api.createQueryPreset(kit.owner(), {
      collection: 'articles',
      name: 'Denied',
      locale: 'en',
      query: presetQuery,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const created = await kit.content.api.createQueryPreset(kit.owner(), {
    collection: 'articles',
    name: '中文',
    locale: 'zh',
    query: presetQuery,
  });
  expect(
    (
      await kit.content.api.listQueryPresets(kit.owner(), { collection: 'articles', locale: 'zh' })
    ).rows.map((row) => row.id),
  ).toEqual([created.id]);
  expect(
    await kit.content.api.listQueryPresets(kit.owner(), { collection: 'articles', locale: 'en' }),
  ).toMatchObject({ total: 0, rows: [] });
  const shared = await kit.content.api.shareQueryPreset(kit.owner(), {
    collection: 'articles',
    id: created.id,
    version: created.version,
    locale: 'zh',
    access: {
      read: { constraint: 'everyone' },
      update: { constraint: 'onlyMe' },
      delete: { constraint: 'onlyMe' },
    },
  });
  expect(shared.shared).toBe(true);
  await kit.content.api.deleteQueryPreset(kit.owner(), {
    collection: 'articles',
    id: created.id,
    version: shared.version,
    locale: 'zh',
  });
});

it('regression: near ordering follows visible related targets and only repeated points inside distance bounds', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  article.access = {
    'documents.get': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Hidden' },
    },
  };
  article.fields = [
    ...article.fields,
    { id: 'location', name: 'location', type: 'point' },
    {
      id: 'locations',
      name: 'locations',
      type: 'array',
      fields: [{ id: 'position', name: 'position', type: 'point' }],
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const { api } = kit.content;
  const hidden = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Hidden', location: [0.5, 0] },
  });
  const far = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Far target', location: [0.8, 0] },
  });
  const close = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Close target', location: [0.6, 0] },
  });
  const first = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'A farther',
      related: [
        { collection: 'articles', id: hidden.id },
        { collection: 'articles', id: far.id },
      ],
      locations: [{ position: [0.001, 0] }, { position: [0.8, 0] }],
    },
  });
  const second = await api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Z closer',
      related: [{ collection: 'articles', id: close.id }],
      locations: [{ position: [0.6, 0] }],
    },
  });
  const editor = await contentActor(kit, ['articles:documents.get', 'articles:documents.list']);
  for (const field of ['related.location', 'locations.position']) {
    const result = await api.listDocuments(editor.ctx(), {
      collection: 'articles',
      where: { field, operator: 'near', value: [0, 0, 100000, 50000] },
    });
    expect(
      result.rows.map((row) => row.id),
      field,
    ).toEqual([second.id, first.id]);
    expect(result.total).toBe(2);
  }
});

it('rejects readiness without the exact safe WGS84 function and its migration ledger', async () => {
  const kit = await fixture();
  await kit.content.verifyReady();
  await kit.database.query(
    'GRANT EXECUTE ON FUNCTION cms_wgs84_distance(float8,float8,float8,float8) TO PUBLIC',
  );
  await expect(kit.content.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  await kit.database.query(
    'REVOKE EXECUTE ON FUNCTION cms_wgs84_distance(float8,float8,float8,float8) FROM PUBLIC',
  );
  await kit.database.query(
    'ALTER FUNCTION cms_wgs84_distance(float8,float8,float8,float8) RENAME TO renamed_wgs84_distance',
  );
  await expect(kit.content.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  await kit.database.query(
    'ALTER FUNCTION renamed_wgs84_distance(float8,float8,float8,float8) RENAME TO cms_wgs84_distance',
  );
  await kit.database.query("DELETE FROM cms_migrations WHERE name='0016_wgs84_distance.sql'");
  await expect(kit.content.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});

const query = {
  q: '',
  sort: [{ field: 'title', order: 'asc' }],
  columns: ['title'],
  where: { field: 'title', operator: 'like', value: 'News' },
};

it('persists private and shared query presets with current authorization before paging and stable CAS', async () => {
  const kit = await fixture();
  const { api } = kit.content;
  const privateView = await api.createQueryPreset(kit.owner(), {
    collection: 'articles',
    name: 'Private',
    query,
  });
  const sharedView = await api.createQueryPreset(kit.owner(), {
    collection: 'articles',
    name: 'Shared',
    access: {
      read: { constraint: 'everyone' },
      update: { constraint: 'onlyMe' },
      delete: { constraint: 'onlyMe' },
    },
    query,
  });
  const editor = await contentActor(kit, [
    'articles:documents.list',
    'articles:queryPresets.list',
    'articles:queryPresets.create',
    'articles:queryPresets.update',
    'articles:queryPresets.delete',
  ]);
  const page = await api.listQueryPresets(editor.ctx(), { collection: 'articles', pageSize: 1 });
  expect(page.rows.map((row) => row.id)).toEqual([sharedView.id]);
  expect(page.total).toBe(1);
  expect(
    (await api.listQueryPresets(editor.ctx(), { collection: 'articles', page: 2, pageSize: 1 }))
      .total,
  ).toBe(1);
  await expect(
    api.updateQueryPreset(editor.ctx(), {
      collection: 'articles',
      id: privateView.id,
      version: 1,
      name: 'Attack',
      query,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    api.createQueryPreset(editor.ctx(), {
      collection: 'articles',
      name: 'Attack',
      access: {
        read: { constraint: 'everyone' },
        update: { constraint: 'onlyMe' },
        delete: { constraint: 'onlyMe' },
      },
      query,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const own = await api.createQueryPreset(editor.ctx(), {
    collection: 'articles',
    name: 'Mine',
    query,
  });
  const updated = await api.updateQueryPreset(editor.ctx(), {
    collection: 'articles',
    id: own.id,
    version: 1,
    name: 'Edited',
    query,
  });
  expect(updated).toMatchObject({ name: 'Edited', version: 2 });
  await expect(
    api.deleteQueryPreset(editor.ctx(), { collection: 'articles', id: own.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await api.deleteQueryPreset(editor.ctx(), { collection: 'articles', id: own.id, version: 2 });
  expect(
    (await api.listQueryPresets(editor.ctx(), { collection: 'articles' })).rows.map(
      (row) => row.id,
    ),
  ).toEqual([sharedView.id]);
});

it('revalidates preset fields for each viewer, replays creates and atomically audits sharing', async () => {
  const kit = await fixture();
  const { api } = kit.content;
  const ctx = kit.owner();
  const input = { collection: 'articles', name: 'Pinned', query };
  const original = await api.createQueryPreset(ctx, input);
  expect((await api.createQueryPreset(ctx, input)).id).toBe(original.id);
  await expect(api.createQueryPreset(ctx, { ...input, name: 'Changed' })).rejects.toMatchObject({
    code: 'idempotency_conflict',
  });
  const hidden = await api.createQueryPreset(kit.owner(), {
    collection: 'articles',
    name: 'Hidden column',
    access: {
      read: { constraint: 'everyone' },
      update: { constraint: 'onlyMe' },
      delete: { constraint: 'onlyMe' },
    },
    query: { ...query, columns: ['secret'] },
  });
  const shared = await api.shareQueryPreset(kit.owner(), {
    collection: 'articles',
    id: original.id,
    version: 1,
    access: {
      read: { constraint: 'everyone' },
      update: { constraint: 'onlyMe' },
      delete: { constraint: 'onlyMe' },
    },
  });
  expect(shared).toMatchObject({
    shared: true,
    access: {
      read: { constraint: 'everyone' },
      update: { constraint: 'onlyMe' },
      delete: { constraint: 'onlyMe' },
    },
    version: 2,
  });
  const editor = await contentActor(kit, ['articles:documents.list', 'articles:queryPresets.list']);
  const page = await api.listQueryPresets(editor.ctx(), { collection: 'articles' });
  expect(page.rows.map((row) => row.id)).toEqual([original.id]);
  expect(page.total).toBe(1);
  expect(page.rows.some((row) => row.id === hidden.id)).toBe(false);
  const audit = await kit.database.query<{ operation_id: string }>(
    'SELECT operation_id FROM audit_events WHERE target_id=$1 ORDER BY created_at,id',
    [original.id],
  );
  expect(audit.rows.map((row) => row.operation_id)).toEqual([
    'queryPresets.create',
    'queryPresets.share',
  ]);
});
