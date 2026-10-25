import { contentActor } from '../../../../../test/support/content-actor.ts';
import { createContent } from '../composition.ts';
import { contentCollection } from '../../../../../test/support/content-runtime.ts';
import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(options: Parameters<typeof createContentFixture>[0] = {}) {
  const kit = await createContentFixture(options);
  fixtures.push(kit);
  return kit;
}

it('creates a folder tree, moves documents and blocks cycles, duplicate names and nonempty deletes', async () => {
  const kit = await fixture();
  const root = await kit.content.api.createFolder(kit.owner(), {
    collection: 'articles',
    name: 'Root',
  });
  const child = await kit.content.api.createFolder(kit.owner(), {
    collection: 'articles',
    name: 'Child',
    parentId: root.id,
  });
  expect(await kit.content.api.listFolders(kit.owner(), { collection: 'articles' })).toMatchObject({
    rows: [{ id: root.id, children: [{ id: child.id, children: [] }] }],
  });
  await expect(
    kit.content.api.createFolder(kit.owner(), { collection: 'articles', name: 'ROOT' }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
  await expect(
    kit.content.api.updateFolder(kit.owner(), {
      collection: 'articles',
      id: root.id,
      version: 1,
      parentId: child.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Filed' },
    folderId: child.id,
  });
  expect(doc.folderId).toBe(child.id);
  expect(
    (
      await kit.content.api.listDocuments(kit.owner(), {
        collection: 'articles',
        folderId: child.id,
      })
    ).total,
  ).toBe(1);
  await expect(
    kit.content.api.deleteFolder(kit.owner(), { collection: 'articles', id: child.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    revision: 1,
    folderId: null,
  });
  const changed = await kit.content.api.updateFolder(kit.owner(), {
    collection: 'articles',
    id: child.id,
    version: 1,
    name: 'Moved',
    parentId: null,
  });
  expect(changed.version).toBe(2);
  await expect(
    kit.content.api.updateFolder(kit.owner(), {
      collection: 'articles',
      id: child.id,
      version: 1,
      name: 'Stale',
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await kit.content.api.deleteFolder(kit.owner(), {
    collection: 'articles',
    id: child.id,
    version: 2,
  });
  await kit.content.api.deleteFolder(kit.owner(), {
    collection: 'articles',
    id: root.id,
    version: 1,
  });
  expect((await kit.content.api.listFolders(kit.owner(), { collection: 'articles' })).rows).toEqual(
    [],
  );
});

it('rejects folder IDs from another collection', async () => {
  const kit = await fixture();
  const folder = await kit.content.api.createFolder(kit.owner(), {
    collection: 'pages',
    name: 'Pages',
  });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Wrong scope' },
      folderId: folder.id,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.updateFolder(kit.owner(), {
      collection: 'articles',
      id: folder.id,
      version: 1,
      name: 'Attack',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('expands shared targets in a batch and returns canonical reverse joins at depth zero', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Article missing');
  article.fields = [
    ...article.fields,
    { id: 'inverse', name: 'pages', type: 'join', join: { collection: 'pages', field: 'author' } },
  ];
  const kit = await fixture({ collections });
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Target' },
  });
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Page', author: { collection: 'articles', id: target.id } },
  });
  const raw = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: target.id,
    depth: 0,
  });
  expect(raw.data['pages']).toEqual([{ collection: 'pages', id: page.id }]);
  const expanded = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: target.id,
    depth: 1,
  });
  expect(expanded.data['pages']).toMatchObject([{ id: page.id, data: { title: 'Page' } }]);
  const back = await kit.content.api.getDocument(kit.owner(), {
    collection: 'pages',
    id: page.id,
    depth: 1,
  });
  expect(back.data['author']).toMatchObject({ id: target.id, data: { title: 'Target' } });
  const selected = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: target.id,
    select: ['title'],
    depth: 1,
  });
  expect(selected.data).toEqual({ title: 'Target' });
});

it('limits relation expansion and refuses invalid read locale fallbacks', async () => {
  const kit = await fixture();
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Target' },
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: target.id, depth: 4 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: target.id,
      locale: 'en',
      fallback: ['en'],
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.getVersion(kit.owner(), {
      collection: 'articles',
      id: target.id,
      versionId: target.versionId,
      fallback: ['xx'],
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('uses the target default language consistently for relationship predicates and expansion', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').locales = {
    default: 'en',
    supported: ['en'],
    fallback: {},
  };
  contentCollection(collections, 'pages').locales = {
    default: 'fr',
    supported: ['fr'],
    fallback: {},
  };
  contentCollection(collections, 'pages').fields = contentCollection(
    collections,
    'pages',
  ).fields.map((field) =>
    field.name === 'title'
      ? {
          ...field,
          localized: true,
          access: {
            read: { version: '1', run: ({ locale }) => locale === 'fr' },
            query: { version: '1', run: ({ locale }) => locale === 'fr' },
          },
        }
      : field,
  );
  contentCollection(collections, 'pages').access = {
    'documents.get': { version: '1', run: ({ locale }) => locale === 'fr' },
  };
  const kit = await fixture({ collections });
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Bonjour' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', related: [{ collection: 'pages', id: target.id }] },
  });
  const detail = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    depth: 1,
  });
  expect(detail.data['related']).toEqual([expect.objectContaining({ data: { title: 'Bonjour' } })]);
  const page = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    where: { field: 'related.title', operator: 'eq', value: 'Bonjour' },
    depth: 1,
  });
  expect(page.total).toBe(1);
  expect(page.rows[0]?.data['related']).toEqual(detail.data['related']);
});

it('applies the requested history mode to field projection', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'pages').fields = contentCollection(
    collections,
    'pages',
  ).fields.map((field) =>
    field.name === 'title'
      ? { ...field, access: { read: { version: '1', run: ({ mode }) => mode === 'published' } } }
      : field,
  );
  const kit = await fixture({ collections });
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Published only' },
  });
  expect(
    (
      await kit.content.api.getVersion(kit.owner(), {
        collection: 'pages',
        id: page.id,
        versionId: page.versionId,
        mode: 'editing',
      })
    ).data,
  ).toEqual({});
  expect(
    (
      await kit.content.api.getVersion(kit.owner(), {
        collection: 'pages',
        id: page.id,
        versionId: page.versionId,
        mode: 'published',
      })
    ).data,
  ).toEqual({ title: 'Published only' });
});

it('keeps multi-hop language and policy scopes aligned with recursive expansion', async () => {
  const collections = workflowCollections();
  const source = contentCollection(collections, 'articles');
  source.locales = { default: 'en', supported: ['en'], fallback: {} };
  const related = source.fields.find((field) => field.name === 'related');
  const middle = contentCollection(collections, 'pages');
  middle.locales = { default: 'fr', supported: ['fr'], fallback: {} };
  const middleTitle = middle.fields.find((field) => field.name === 'title');
  const author = middle.fields.find((field) => field.name === 'author');
  const terminal = contentCollection(collections, 'settings');
  terminal.locales = { default: 'en', supported: ['en', 'fr'], fallback: {} };
  const terminalTitle = terminal.fields.find((field) => field.name === 'title');
  if (!related || !middleTitle || !author || !terminalTitle)
    throw new Error('Missing relationship fixture');
  middleTitle.localized = true;
  author.relationTo = ['settings'];
  terminalTitle.localized = true;
  terminalTitle.access = { query: { version: '1', run: ({ actor }) => actor.role.isSuper } };
  terminal.access = { 'documents.get': { version: '1', run: ({ locale }) => locale === 'fr' } };
  const kit = await fixture({ collections });
  const last = await kit.content.api.createDocument(kit.owner(), {
    collection: 'settings',
    dataByLocale: { en: { title: 'English' }, fr: { title: 'Bonjour' } },
  });
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Middle', author: { collection: 'settings', id: last.id } },
  });
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', related: [{ collection: 'pages', id: page.id }] },
  });
  const detail = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    depth: 2,
  });
  const found = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    depth: 2,
    where: { field: 'related.author.title', operator: 'eq', value: 'Bonjour' },
  });
  expect(found.total).toBe(1);
  expect(found.rows[0]?.data).toEqual(detail.data);
  expect(
    (
      await kit.content.api.listDocuments(kit.owner(), {
        collection: 'articles',
        where: { field: 'related.author.title', operator: 'eq', value: 'English' },
      })
    ).total,
  ).toBe(0);
  await expect(
    kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'related.unknown.title', operator: 'eq', value: 'Bonjour' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'related.author.title', operator: 'eq', value: 7 },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const grants = ['articles:documents.list', 'pages:documents.get'];
  const editor = await contentActor(kit, grants);
  expect(
    (
      await kit.content.api.listDocuments(editor.ctx(), {
        collection: 'articles',
        where: { field: 'related.author.title', operator: 'eq', value: 'Bonjour' },
      })
    ).total,
  ).toBe(0);
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: editor.role.id,
    version: editor.role.version,
    permissionIds: [...grants, 'settings:documents.get'].map((key) => kit.permissionIds.get(key)),
  });
  await expect(
    kit.content.api.listDocuments(editor.ctx(), {
      collection: 'articles',
      where: { field: 'related.author.title', operator: 'eq', value: 'Bonjour' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('enforces folder capacity and descendant depth without partially moving a subtree', async () => {
  const kit = await fixture();
  const bounded = createContent({
    ...kit.contentOptions,
    workPolicy: { ...kit.contentOptions.workPolicy, maxFolders: 3, maxFolderDepth: 2 },
  });
  try {
    const root = await bounded.api.createFolder(kit.owner(), {
      collection: 'articles',
      name: 'Root',
    });
    const child = await bounded.api.createFolder(kit.owner(), {
      collection: 'articles',
      name: 'Child',
      parentId: root.id,
    });
    await expect(
      bounded.api.createFolder(kit.owner(), {
        collection: 'articles',
        name: 'Too deep',
        parentId: child.id,
      }),
    ).rejects.toMatchObject({ code: 'capacity_exceeded' });
    const other = await bounded.api.createFolder(kit.owner(), {
      collection: 'articles',
      name: 'Other',
    });
    await expect(
      bounded.api.updateFolder(kit.owner(), {
        collection: 'articles',
        id: root.id,
        version: root.version,
        parentId: other.id,
      }),
    ).rejects.toMatchObject({ code: 'capacity_exceeded' });
    await expect(
      bounded.api.createFolder(kit.owner(), { collection: 'articles', name: 'Too many' }),
    ).rejects.toMatchObject({ code: 'capacity_exceeded' });
    await expect(
      bounded.api.updateFolder(kit.owner(), {
        collection: 'articles',
        id: child.id,
        version: 99,
        name: 'Stale',
      }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    expect(
      (await bounded.api.listFolders(kit.owner(), { collection: 'articles' })).rows,
    ).toMatchObject([
      { id: other.id },
      { id: root.id, parentId: null, children: [{ id: child.id }] },
    ]);
    await expect(
      bounded.api.deleteFolder(kit.owner(), { collection: 'articles', id: root.id, version: 99 }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
  } finally {
    await bounded.close();
  }
});
