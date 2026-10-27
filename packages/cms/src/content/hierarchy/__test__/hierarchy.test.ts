import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import type { CollectionDefinition } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(change?: (collections: CollectionDefinition[]) => void) {
  const collections = workflowCollections();
  const collection = contentCollection(collections, 'articles');
  collection.hierarchy = { joinField: { name: 'children' } };
  collection.admin = { useAsTitle: 'title' };
  change?.(collections);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}
function create(kit: ContentFixture, title: string, parent?: string) {
  const data = { title, ...(parent ? { parent: { collection: 'articles', id: parent } } : {}) };
  return kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: { en: data, zh: { title: `中${title}` } },
  });
}

it('computes current localized hierarchy paths and keeps virtual fields out of writes', async () => {
  const kit = await fixture();
  const root = await create(kit, 'Root');
  const child = await create(kit, 'Child', root.id);
  expect(child.data['slugPath']).toBe('root/child');
  expect(child.data['titlePath']).toBe('Root/Child');
  const chinese = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: child.id,
    locale: 'zh',
    fallback: [],
  });
  expect(chinese.data['slugPath']).toBe('中root/中child');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: child.id,
      revision: child.revision,
      data: { slugPath: 'injected' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('regression: hierarchy join metadata emits a JSON schema with its real target collection', async () => {
  const kit = await fixture();
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata.hierarchy).toMatchObject({ parentFieldName: 'parent', kind: 'hierarchy' });
  expect(JSON.stringify(metadata.dataSchema)).toContain('"enum":["articles"]');
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(editor.layout.find((field) => field.name === 'children')).toMatchObject({
    write: 'denied',
  });
});

it('regression: rejects self parents, cross collection parents and circular moves through normal saves and concurrent writers', async () => {
  const kit = await fixture();
  const root = await create(kit, 'Root');
  const child = await create(kit, 'Child', root.id);
  for (const parent of [
    { collection: 'articles', id: root.id },
    { collection: 'articles', id: child.id },
    { collection: 'pages', id: child.id },
  ])
    await expect(
      kit.content.api.updateDocument(kit.owner(), {
        collection: 'articles',
        id: root.id,
        revision: root.revision,
        data: { parent },
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  const other = await create(kit, 'Other');
  const attempts = await Promise.allSettled(
    [
      [root, other],
      [other, root],
    ].map(([source, target]) => {
      if (!source || !target) throw new Error('Missing pair');
      return kit.content.api.updateDocument(kit.owner(), {
        collection: 'articles',
        id: source.id,
        revision: source.revision,
        data: { parent: { collection: 'articles', id: target.id } },
      });
    }),
  );
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(attempts.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 'invalid_input' },
  });
});

it('does not reveal hidden ancestor titles or parent fields in hierarchy paths', async () => {
  const kit = await fixture((collections) => {
    contentCollection(collections, 'articles').access = {
      'documents.get': {
        version: 'visible-children',
        run: ({ actor }) =>
          actor.role.isSuper || { field: 'title', operator: 'ne', value: 'Secret ancestor' },
      },
    };
  });
  const root = await create(kit, 'Secret ancestor');
  const child = await create(kit, 'Visible child', root.id);
  const reader = await contentActor(kit, ['articles:documents.get']);
  const view = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: child.id,
  });
  expect(view.data['slugPath']).toBeNull();
  expect(view.data['titlePath']).toBeNull();
  expect(JSON.stringify(view)).not.toContain('Secret ancestor');
});

it('enforces tag collection restrictions on new references and on later restriction changes', async () => {
  const kit = await fixture((collections) => {
    contentCollection(collections, 'articles').tags = { collectionSpecific: true };
    delete contentCollection(collections, 'articles').hierarchy;
    const pages = contentCollection(collections, 'pages');
    const settings = contentCollection(collections, 'settings');
    settings.fields = [
      ...settings.fields,
      { id: 'tags', name: 'tags', type: 'relationship', relationTo: ['articles'], hasMany: true },
    ];
    pages.fields = [
      ...pages.fields,
      { id: 'tags', name: 'tags', type: 'relationship', relationTo: ['articles'], hasMany: true },
    ];
  });
  const tag = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Tag', hierarchyType: ['pages'] },
  });
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Page', tags: [{ collection: 'articles', id: tag.id }] },
  });
  expect(page.data['tags']).toEqual([{ collection: 'articles', id: tag.id }]);
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: tag.id,
      revision: tag.revision,
      data: { hierarchyType: ['settings'] },
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'settings',
      data: { title: 'Settings', tags: [{ collection: 'articles', id: tag.id }] },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('pages tree branches and moves multiple documents atomically with their expected revisions', async () => {
  const kit = await fixture();
  const root = await create(kit, 'Root');
  const first = await create(kit, 'First');
  const second = await create(kit, 'Second');
  const branch = await kit.content.api.readHierarchy(kit.owner(), {
    collection: 'articles',
    pageSize: 1,
  });
  expect(branch).toMatchObject({ parentId: null, total: 3, page: 1, pageSize: 1 });
  expect(branch.rows).toHaveLength(1);
  await expect(
    kit.content.api.moveHierarchy(kit.owner(), {
      collection: 'articles',
      parentId: root.id,
      items: [
        { id: first.id, revision: first.revision },
        { id: second.id, revision: second.revision + 1 },
      ],
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: first.id }),
  ).resolves.toMatchObject({ revision: first.revision });
  const moved = await kit.content.api.moveHierarchy(kit.owner(), {
    collection: 'articles',
    parentId: root.id,
    items: [first, second].map(({ id, revision }) => ({ id, revision })),
  });
  expect(moved.rows.map((document) => document.data['titlePath'])).toEqual([
    'Root/First',
    'Root/Second',
  ]);
  const children = await kit.content.api.readHierarchy(kit.owner(), {
    collection: 'articles',
    parentId: root.id,
  });
  expect(children.rows.map((document) => document.id)).toEqual([first.id, second.id]);
  const reader = await contentActor(kit, [
    'articles:hierarchy.tree',
    'articles:documents.list',
    'articles:documents.get',
  ]);
  await expect(
    kit.content.api.readHierarchy(reader.ctx(), { collection: 'articles', parentId: root.id }),
  ).resolves.toMatchObject({ total: 2 });
  await expect(
    kit.content.api.moveHierarchy(reader.ctx(), {
      collection: 'articles',
      parentId: null,
      items: [{ id: first.id, revision: first.revision + 1 }],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('rejects publication cycles assembled from older published parents and protects published children from parent unpublication', async () => {
  const kit = await fixture();
  const root = await create(kit, 'Root');
  const rootPublished = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: root.id,
    revision: root.revision,
  });
  const child = await create(kit, 'Child', root.id);
  const childPublished = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: child.id,
    revision: child.revision,
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: child.id,
    revision: childPublished.revision,
    data: { parent: null },
  });
  const changedRoot = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: root.id,
    revision: rootPublished.revision,
    data: { parent: { collection: 'articles', id: child.id } },
  });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: root.id,
      revision: changedRoot.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.unpublishDocument(kit.owner(), {
      collection: 'articles',
      id: root.id,
      revision: changedRoot.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
});

it('refuses moves that make existing descendants deeper than the configured hierarchy limit', async () => {
  const kit = await fixture();
  let parent: string | undefined;
  for (let depth = 0; depth < kit.contentOptions.workPolicy.maxFolderDepth; depth += 1)
    parent = (await create(kit, `Level ${depth}`, parent)).id;
  const other = await create(kit, 'Other');
  await expect(create(kit, 'Too deep', parent)).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  const roots = await kit.content.api.readHierarchy(kit.owner(), { collection: 'articles' });
  const chainRoot = roots.rows.find((document) => document.data['title'] === 'Level 0');
  if (!chainRoot) throw new Error('Missing chain root');
  await expect(
    kit.content.api.moveHierarchy(kit.owner(), {
      collection: 'articles',
      parentId: other.id,
      items: [{ id: chainRoot.id, revision: chainRoot.revision }],
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
});

it('regression: a hidden parent field conceals root status and a hidden slug does not hide the readable title path', async () => {
  const kit = await fixture((collections) => {
    const definition = contentCollection(collections, 'articles');
    definition.fields = [
      ...definition.fields,
      {
        id: 'parent',
        name: 'parent',
        type: 'relationship',
        relationTo: ['articles'],
        access: { read: { version: 'owner-parent', run: ({ actor }) => actor.role.isSuper } },
      },
    ];
  });
  const root = await create(kit, 'Root');
  const reader = await contentActor(kit, ['articles:documents.get']);
  const hidden = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: root.id,
  });
  expect(hidden.data).toMatchObject({ slugPath: null, titlePath: null });
});

it('keeps title and slug path permissions independent and supports nested title fields', async () => {
  const kit = await fixture((collections) => {
    const definition = contentCollection(collections, 'articles');
    definition.hierarchy = { slugField: 'slug' };
    definition.admin = { useAsTitle: 'details.name' };
    definition.fields = definition.fields.map((field) =>
      field.name === 'slug'
        ? {
            ...field,
            access: { read: { version: 'owner-slug', run: ({ actor }) => actor.role.isSuper } },
          }
        : field,
    );
    definition.fields = [
      ...definition.fields,
      {
        id: 'details',
        name: 'details',
        type: 'group',
        fields: [{ id: 'display_name', name: 'name', type: 'text' }],
      },
    ];
  });
  const root = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Stored', slug: 'nested-root', details: { name: 'Nested title' } },
  });
  expect(root.data).toMatchObject({ slugPath: 'nested-root', titlePath: 'Nested title' });
  const reader = await contentActor(kit, ['articles:documents.get']);
  const visible = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: root.id,
  });
  expect(visible.data).toMatchObject({ slugPath: null, titlePath: 'Nested title' });
});

it('regression: restored trash cannot reactivate a child until its archived ancestor is restored', async () => {
  const kit = await fixture((collections) => {
    const definition = contentCollection(collections, 'articles');
    definition.fields = [
      ...definition.fields,
      {
        id: 'parent',
        name: 'parent',
        type: 'relationship',
        relationTo: ['articles'],
        onDelete: 'cascade',
      },
    ];
  });
  const root = await create(kit, 'Root');
  const child = await create(kit, 'Child', root.id);
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: root.id,
    revision: root.revision,
  });
  const trash = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    trashed: true,
  });
  const childTrash = trash.rows.find((document) => document.id === child.id);
  if (!childTrash) throw new Error('Missing cascaded child');
  await expect(
    kit.content.api.restoreTrashedDocument(kit.owner(), {
      collection: 'articles',
      id: child.id,
      revision: childTrash.revision,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'articles',
    id: root.id,
    revision: archived.revision,
  });
  const restored = await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'articles',
    id: child.id,
    revision: childTrash.revision,
  });
  expect(restored.data['titlePath']).toBe('Root/Child');
});

it('does not restore a historical parent relation that now points into the document descendants', async () => {
  const kit = await fixture();
  const first = await create(kit, 'First');
  const second = await create(kit, 'Second', first.id);
  const detached = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: second.id,
    revision: second.revision,
    data: { parent: null },
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { parent: { collection: 'articles', id: second.id } },
  });
  const historical = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: second.id,
    versionId: second.versionId,
  });
  expect(historical.data).toMatchObject({ title: 'Second', titlePath: null, slugPath: null });
  await expect(
    kit.content.api.restoreVersion(kit.owner(), {
      collection: 'articles',
      id: second.id,
      revision: detached.revision,
      versionId: second.versionId,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('regression: materialized virtual fields cannot broaden parent read permission through hierarchy paths', async () => {
  const kit = await fixture((collections) => {
    const collection = contentCollection(collections, 'articles');
    collection.fields = [
      ...collection.fields,
      { id: 'hint', name: 'hint', type: 'text', virtual: 'title' },
      {
        id: 'parent',
        name: 'parent',
        type: 'relationship',
        relationTo: ['articles'],
        access: {
          read: {
            version: 'raw-parent-policy',
            run: ({ actor, data }) => actor.role.isSuper || typeof data?.['hint'] === 'string',
          },
        },
      },
    ];
  });
  const root = await create(kit, 'Secret parent');
  const child = await create(kit, 'Visible child', root.id);
  const reader = await contentActor(kit, ['articles:documents.get']);
  const rootView = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: root.id,
  });
  expect(rootView.data['titlePath']).toBeNull();
  expect(rootView.data['slugPath']).toBeNull();
  const view = await kit.content.api.getDocument(reader.ctx(), {
    collection: 'articles',
    id: child.id,
  });
  expect(view.data['parent']).toBeUndefined();
  expect(view.data['hint']).toBe('Visible child');
  expect(view.data['titlePath']).toBeNull();
  expect(view.data['slugPath']).toBeNull();
  expect(JSON.stringify(view)).not.toContain('Secret parent');
});

it('uses asynchronous virtual titles consistently for the document and every visible ancestor', async () => {
  const kit = await fixture((collections) => {
    const collection = contentCollection(collections, 'articles');
    collection.admin = { useAsTitle: 'displayTitle' };
    collection.fields = [
      ...collection.fields,
      {
        id: 'display_title',
        name: 'displayTitle',
        type: 'text',
        virtual: {
          version: 'read-title',
          run: ({ data }) =>
            Promise.resolve(
              typeof data?.['title'] === 'string' ? `Read ${data['title']}` : undefined,
            ),
        },
      },
    ];
  });
  const root = await create(kit, 'Root');
  const child = await create(kit, 'Child', root.id);
  expect(child.data['titlePath']).toBe('Read Root/Read Child');
  expect(child.data['slugPath']).toBe('read-root/read-child');
  const view = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: child.id,
  });
  expect(view.data['titlePath']).toBe('Read Root/Read Child');
});
