import { afterEach, expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

it('regression: joins use original field read authority in get, list, versions and populated documents after presentation changes', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'gate', name: 'gate', type: 'boolean' },
    { id: 'linked', name: 'linked', type: 'relationship', relationTo: ['articles'] },
    {
      id: 'private_join',
      name: 'privateJoin',
      type: 'join',
      join: { collection: 'pages', field: 'author' },
      access: { read: { version: 'original-flag', run: ({ data }) => data?.['gate'] === true } },
    },
  ];
  articles.hooks = {
    afterRead: [
      {
        version: 'presentation',
        run: ({ data }) =>
          typeof data['gate'] === 'boolean' ? { ...data, gate: !data['gate'] } : data,
      },
    ],
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const denied = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Denied', gate: false },
  });
  const allowed = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Allowed', gate: true },
  });
  const pageIds = new Map<string, string>();
  for (const source of [denied, allowed]) {
    const page = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Related', author: { collection: 'articles', id: source.id } },
    });
    pageIds.set(source.id, page.id);
  }
  const carrier = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Carrier', linked: { collection: 'articles', id: denied.id } },
  });
  const direct = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: denied.id,
    depth: 0,
  });
  const list = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    depth: 0,
  });
  const listed = list.rows.find((row) => row.id === denied.id);
  if (!listed) throw new Error('Missing listed document');
  const version = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: denied.id,
    versionId: denied.versionId,
    depth: 0,
  });
  const populated = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: carrier.id,
    depth: 2,
  });
  const { linked } = populated.data;
  if (!linked || typeof linked !== 'object' || Array.isArray(linked))
    throw new Error('Missing linked document');
  const { data: linkedData } = linked;
  if (!linkedData || typeof linkedData !== 'object' || Array.isArray(linkedData))
    throw new Error('Missing linked data');
  expect(
    [direct.data, listed.data, version.data, linkedData].map((data) =>
      Object.hasOwn(data, 'privateJoin'),
    ),
  ).toEqual([false, false, false, false]);
  const permitted = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: allowed.id,
    depth: 0,
  });
  expect(permitted.data['gate']).toBe(false);
  expect(permitted.data['privateJoin']).toMatchObject({
    rows: [expect.objectContaining({ id: pageIds.get(allowed.id) })],
  });
});

it('regression: population honors the same relational read policy as direct access and keeps denied targets null', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'targets', name: 'targets', type: 'relationship', relationTo: ['pages'], hasMany: true },
  ];
  let enforce = false;
  contentCollection(collections, 'pages').access = {
    'documents.get': {
      version: 'owner-title',
      run: () => (enforce ? { field: 'author.title', operator: 'eq', value: 'Allowed' } : true),
    },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const targets = [];
  for (const title of ['Allowed', 'Denied']) {
    const owner = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title },
    });
    targets.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'pages',
        data: { title, author: { collection: 'articles', id: owner.id } },
      }),
    );
  }
  const [allowed, denied] = targets;
  if (!allowed || !denied) throw new Error('Missing target fixture');
  const carrier = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Carrier',
      targets: targets.map((row) => ({ collection: 'pages', id: row.id })),
    },
  });
  enforce = true;
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'pages', id: allowed.id })).id,
  ).toBe(allowed.id);
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'pages', id: denied.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const populated = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: carrier.id,
    depth: 1,
  });
  expect(populated.data['targets']).toMatchObject([
    { id: allowed.id, data: { title: 'Allowed' } },
    null,
  ]);
});
