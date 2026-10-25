import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { workflowCollections } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { createContent } from '../../composition.ts';
import { article, fixture, node } from './support.ts';

const superOr = (operator: 'gte' | 'lte', value: number) => ({
  version: '1',
  run: ({ actor }: { actor: { role: { isSuper: boolean } } }) =>
    actor.role.isSuper || { field: 'score', operator, value },
});

it('uses published data and the requested fallback for documents.get field policy context', async () => {
  const collections = workflowCollections();
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'published_detail',
      name: 'detail',
      type: 'text',
      access: {
        read: {
          version: '1',
          run: ({ operation, mode, data }) =>
            operation === 'documents.get' &&
            mode === 'published' &&
            data?.['title'] === 'Published',
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const original = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Published', detail: 'Private detail' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: original.id,
    revision: original.revision,
  });
  const draft = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: original.id,
    revision: published.revision,
    data: { title: 'Draft' },
  });
  const preview = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: original.id,
    mode: 'published',
    locale: 'zh',
    fallback: ['en'],
  });
  expect(preview.document?.versionId).toBe(published.versionId);
  expect(preview.document?.revision).toBe(draft.revision);
  expect(node(preview.layout, 'published_detail').write).toBe('denied');
  expect(preview.locales).toEqual({
    default: 'en',
    supported: ['en', 'zh'],
    fallback: { zh: ['en'] },
  });
  expect(preview.fallback).toEqual(['en']);
  const withoutFallback = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: original.id,
    mode: 'published',
    locale: 'zh',
    fallback: [],
  });
  expect(JSON.stringify(withoutFallback.layout)).not.toContain('published_detail');
  const editing = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: original.id,
  });
  expect(editing.document?.versionId).toBe(draft.versionId);
  expect(JSON.stringify(editing.layout)).not.toContain('published_detail');
  expect(editing.schemas.draft['properties']).toEqual({});
});

it('intersects editor, actual read and selected write resource predicates', async () => {
  const collections = workflowCollections();
  article(collections).access = {
    'collections.editor': superOr('gte', 10),
    'documents.get': superOr('lte', 20),
    'documents.update': superOr('gte', 15),
  };
  const kit = await fixture(collections);
  const documents = [];
  for (const score of [5, 12, 17, 25])
    documents.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title: `Score ${score}`, score },
      }),
    );
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
    'articles:documents.update',
  ]);
  for (const document of [documents[0], documents[3]]) {
    await expect(
      kit.content.api.getEditor(actor.ctx(), { collection: 'articles', id: document?.id }),
    ).rejects.toMatchObject({ code: 'not_found' });
  }
  await expect(
    kit.content.api.getEditor(actor.ctx(), {
      collection: 'articles',
      intent: 'update',
      id: documents[1]?.id,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const view = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    intent: 'update',
    id: documents[2]?.id,
  });
  expect(view.document?.id).toBe(documents[2]?.id);
  expect(view.actions.find((action) => action.operationId === 'documents.update')?.state).toBe(
    'conditional',
  );
  expect(view.actions.find((action) => action.operationId === 'documents.publish')?.state).toBe(
    'denied',
  );
});

it('applies relationship target read scopes to the editor predicate', async () => {
  const collections = workflowCollections();
  article(collections).access = {
    'collections.editor': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper || { field: 'related.title', operator: 'eq', value: 'Visible target' },
    },
  };
  const kit = await fixture(collections);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Visible target' },
  });
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', related: [{ collection: 'pages', id: target.id }] },
  });
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
    'pages:documents.get',
  ]);
  await expect(
    kit.content.api.getEditor(actor.ctx(), { collection: 'articles', id: document.id }),
  ).resolves.toMatchObject({ document: { id: document.id } });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: [
      kit.permissionIds.get('articles:collections.editor'),
      kit.permissionIds.get('articles:documents.get'),
    ],
  });
  await expect(
    kit.content.api.getEditor(actor.ctx(), { collection: 'articles', id: document.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('rejects a create template constrained by the editor document predicate', async () => {
  const collections = workflowCollections();
  article(collections).access = {
    'collections.editor': {
      version: '1',
      run: () => ({ field: 'score', operator: 'gte', value: 10 }),
    },
  };
  const kit = await fixture(collections);
  await expect(
    kit.content.api.getEditor(kit.owner(), { collection: 'articles', intent: 'create' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('does not let editor permission replace document read, write, collection scope or activation checks', async () => {
  const kit = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Restricted' },
  });
  const actor = await contentActor(kit, ['articles:collections.editor', 'articles:documents.get']);
  const preview = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    id: document.id,
  });
  expect(node(preview.layout, 'title').write).toBe('denied');
  await expect(
    kit.content.api.getEditor(actor.ctx(), {
      collection: 'articles',
      intent: 'update',
      id: document.id,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.getEditor(actor.ctx(), { collection: 'pages', id: document.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: [],
  });
  await expect(
    kit.content.api.getEditor(actor.ctx(), { collection: 'articles', id: document.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('keeps archived and unpublished resources outside the existing document read boundary', async () => {
  const kit = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Draft' },
  });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'update',
    id: document.id,
  });
  expect(
    editor.actions.find((action) => action.operationId === 'documents.restoreTrash')?.state,
  ).toBe('denied');
  expect(editor.actions.find((action) => action.operationId === 'documents.purge')?.state).toBe(
    'denied',
  );
  await expect(
    kit.content.api.getEditor(kit.owner(), {
      collection: 'articles',
      mode: 'published',
      id: document.id,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: document.revision,
  });
  await expect(
    kit.content.api.getEditor(kit.owner(), { collection: 'articles', id: document.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.getEditor(kit.owner(), { collection: 'articles', id: randomUUID() }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('rejects invalid input combinations and unsupported autosave before exposing metadata', async () => {
  const kit = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A' },
  });
  const base = { collection: 'articles', id: document.id };
  for (const input of [
    { collection: 'articles' },
    { ...base, intent: 'create' },
    { ...base, intent: 'update', mode: 'published' },
    { ...base, intent: 'update', fallback: [] },
    { ...base, locale: 'missing' },
    { ...base, locale: 'zh', fallback: ['en', 'en'] },
    { ...base, locale: 'en', fallback: ['en'] },
    { ...base, fallback: ['missing'] },
    { ...base, where: {} },
    { ...base, nextData: {} },
    { ...base, intent: 'erase' },
    { ...base, id: 'invalid' },
  ])
    await expect(kit.content.api.getEditor(kit.owner(), input)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  await expect(
    kit.content.api.getEditor(kit.owner(), {
      collection: 'pages',
      intent: 'autosave',
      id: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('fails explicitly when response or database budgets are exhausted', async () => {
  const responseBound = await fixture(workflowCollections(), {
    compose(options) {
      const configured = { ...options, limits: { ...options.limits, maxResponseBytes: 300 } };
      const content = createContent(configured);
      return { content, options: configured, close: () => content.close() };
    },
  });
  await expect(
    responseBound.content.api.getEditor(responseBound.owner(), {
      collection: 'articles',
      intent: 'create',
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  const sqlBound = await fixture(workflowCollections(), { maxSqlQueries: 1 });
  await expect(
    sqlBound.content.api.getEditor(sqlBound.owner(), { collection: 'articles', intent: 'create' }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
});

it('keeps a create resource predicate conditional until candidate values are submitted', async () => {
  const collections = workflowCollections();
  article(collections).access = {
    'documents.create': {
      version: '1',
      run: () => ({ field: 'score', operator: 'gte', value: 10 }),
    },
  };
  const kit = await fixture(collections);
  const form = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(node(form.layout, 'title').write).toBe('conditional');
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Outside scope', score: 1 },
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Inside scope', score: 12 },
    }),
  ).resolves.toMatchObject({ data: { score: 12 } });
});

it.each([
  { collection: 'articles', action: 'documents.copy', extras: [] },
  { collection: 'articles', action: 'content.schedulePublication', extras: [] },
  { collection: 'articles', action: 'versions.restore', extras: [] },
  { collection: 'pages', action: 'versions.restore', extras: ['versions.get'] },
] as const)(
  'denies $action hints when a known prerequisite is missing in $collection',
  async ({ collection, action, extras }) => {
    const kit = await fixture();
    const document = await kit.content.api.createDocument(kit.owner(), {
      collection,
      data: { title: 'Prerequisite source' },
    });
    const actor = await contentActor(kit, [
      `${collection}:collections.editor`,
      `${collection}:documents.get`,
      `${collection}:${action}`,
      ...extras.map((operation) => `${collection}:${operation}`),
    ]);
    const editor = await kit.content.api.getEditor(actor.ctx(), { collection, id: document.id });
    expect(editor.actions.find((item) => item.operationId === action)?.state).toBe('denied');
    let request: Promise<unknown>;
    if (action === 'documents.copy')
      request = kit.content.api.copyDocument(actor.ctx(), {
        collection,
        id: document.id,
        revision: document.revision,
      });
    else if (action === 'content.schedulePublication')
      request = kit.content.api.schedulePublication(actor.ctx(), {
        collection,
        id: document.id,
        revision: document.revision,
        versionId: document.versionId,
        executeAt: new Date(Date.now() + 60_000).toISOString(),
      });
    else
      request = kit.content.api.restoreVersion(actor.ctx(), {
        collection,
        id: document.id,
        revision: document.revision,
        versionId: document.versionId,
      });
    await expect(request).rejects.toMatchObject({ code: 'forbidden' });
  },
);

it('keeps copy source checks within the query budget across twenty relationship scoped locales', async () => {
  const collections = workflowCollections();
  const source = article(collections);
  source.locales = {
    default: 'en',
    supported: ['en', ...Array.from({ length: 19 }, (_, index) => `locale-${index}`)],
    fallback: {},
  };
  source.fields = source.fields.map((field) =>
    field.name === 'related' ? { ...field, relationTo: ['pages'] } : field,
  );
  source.access = {
    'collections.editor': superOr('gte', 0),
    'documents.get': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper || { field: 'related.title', operator: 'eq', value: 'Visible target' },
    },
  };
  const kit = await fixture(collections);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Visible target' },
  });
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Copy source', score: 1, related: [{ collection: 'pages', id: target.id }] },
  });
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
    'articles:documents.copy',
    'articles:documents.create',
    'pages:documents.get',
  ]);
  const editor = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    id: document.id,
    intent: 'copy',
  });
  expect(editor.document?.id).toBe(document.id);
  expect(node(editor.layout, 'title').write).toBe('allowed');
  expect(editor.actions.find((item) => item.operationId === 'documents.copy')?.state).toBe(
    'conditional',
  );
});

it('refuses a writable copy editor when creation permission is missing', async () => {
  const kit = await fixture();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Copy source' },
  });
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
    'articles:documents.copy',
  ]);
  await expect(
    kit.content.api.getEditor(actor.ctx(), {
      collection: 'articles',
      id: document.id,
      intent: 'copy',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('keeps create predicates conditional instead of applying them to a copy source', async () => {
  const collections = workflowCollections();
  article(collections).access = {
    'documents.create': {
      version: '1',
      run: ({ actor }) => actor.role.isSuper || { field: 'score', operator: 'gte', value: 10 },
    },
  };
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Outside create result scope', score: 1 },
  });
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
    'articles:documents.copy',
    'articles:documents.create',
  ]);
  const editor = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    id: document.id,
    intent: 'copy',
  });
  expect(node(editor.layout, 'score').write).toBe('conditional');
  expect(editor.actions.find((item) => item.operationId === 'documents.copy')?.state).toBe(
    'conditional',
  );
  await expect(
    kit.content.api.copyDocument(actor.ctx(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      data: { score: 20 },
    }),
  ).resolves.toMatchObject({ data: { score: 20 } });
});

it('checks every source locale required by copying before advertising a writable copy', async () => {
  const collections = workflowCollections();
  article(collections).access = {
    'documents.get': {
      version: '1',
      run: ({ actor, locale }) => actor.role.isSuper || locale === 'en',
    },
  };
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Multilingual copy' },
  });
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
    'articles:documents.copy',
    'articles:documents.create',
  ]);
  const editor = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    id: document.id,
  });
  expect(editor.actions.find((item) => item.operationId === 'documents.copy')?.state).toBe(
    'denied',
  );
  await expect(
    kit.content.api.getEditor(actor.ctx(), {
      collection: 'articles',
      id: document.id,
      intent: 'copy',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.copyDocument(actor.ctx(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it.each([
  { action: 'content.schedulePublication', prerequisite: 'documents.publish' },
  { action: 'versions.restore', prerequisite: 'versions.get' },
] as const)(
  'uses the actual $prerequisite source predicate for $action hints',
  async ({ action, prerequisite }) => {
    const collections = workflowCollections();
    article(collections).access = {
      [prerequisite]: {
        version: '1',
        run: ({ actor }) => actor.role.isSuper || { field: 'score', operator: 'gte', value: 10 },
      },
    };
    const kit = await fixture(collections);
    const document = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Predicate restricted', score: 1 },
    });
    const actor = await contentActor(kit, [
      'articles:collections.editor',
      'articles:documents.get',
      `articles:${action}`,
      `articles:${prerequisite}`,
    ]);
    const editor = await kit.content.api.getEditor(actor.ctx(), {
      collection: 'articles',
      id: document.id,
    });
    expect(editor.actions.find((item) => item.operationId === action)?.state).toBe('denied');
  },
);
