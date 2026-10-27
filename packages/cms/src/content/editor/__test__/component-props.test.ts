import { afterEach, expect, it } from 'vitest';
import { createContent } from '../../composition.ts';
import { createRegistry, generateArtifacts } from '../../generate.ts';
import {
  createContentFixture,
  contentCollection,
  contentField,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition, ContentLimits } from '../../definition.ts';
import type { AdminComponentRegistration } from '../../collections/admin-types.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(
  collections: CollectionDefinition[],
  registrations: AdminComponentRegistration[],
  limits: Partial<ContentLimits> = {},
) {
  const kit = await createContentFixture({
    collections,
    adminComponents: registrations,
    compose(options) {
      const configured = { ...options, limits: { ...options.limits, ...limits } };
      const content = createContent(configured);
      return { content, options: configured, close: () => content.close() };
    },
  });
  fixtures.push(kit);
  return kit;
}
const reference = { id: 'site/presentation', props: { prefix: 'Configured' } };
function registration(): AdminComponentRegistration {
  return {
    id: 'site/presentation',
    version: '1',
    slots: ['Field', 'Cell', 'Filter', 'Diff', 'View', 'NoResults'],
    validateProps: {
      version: 'caption',
      run: ({ props }) =>
        Promise.resolve(
          typeof props['caption'] === 'string' &&
            props['prefix'] === 'Configured' &&
            Object.keys(props).every((key) => ['caption', 'prefix'].includes(key)),
        ),
    },
    resolveProps: {
      version: 'authorized',
      run: ({ data, props }) =>
        Promise.resolve({
          caption: `${typeof data['title'] === 'string' ? data['title'] : 'Empty'}:${Object.hasOwn(data, 'secret') ? 'visible' : 'hidden'}:${typeof props['prefix'] === 'string' ? props['prefix'] : ''}`,
        }),
    },
  };
}

it('registered props use authorized values for editor, candidate, cell, history, filter and custom views while UI fields stay nonpersistent', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  contentField(articles, 'title').admin = {
    components: { Field: reference, Cell: reference, Filter: reference, Diff: reference },
  };
  articles.fields = [
    ...articles.fields,
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: { read: { version: 'deny', run: () => false } },
    },
    { id: 'notice', name: 'notice', type: 'ui', admin: { components: { Field: reference } } },
  ];
  articles.admin = {
    components: { NoResults: reference },
    views: [
      {
        id: 'report',
        scope: 'document',
        path: 'report/summary',
        label: 'Report',
        component: reference,
      },
    ],
  };
  const registrations = [registration()];
  const kit = await fixture(collections, registrations);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Allowed', secret: 'Private' },
  });
  expect(document.data).not.toHaveProperty('secret');
  expect(document.data).not.toHaveProperty('notice');
  expect(document.componentProps?.['title#title:Cell:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Allowed:hidden:Configured',
  });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: document.id,
    intent: 'update',
  });
  expect(editor.layout.find((node) => node.id === 'notice')).toMatchObject({
    type: 'ui',
    write: 'denied',
  });
  expect(editor.componentProps?.['notice#notice:Field:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Allowed:hidden:Configured',
  });
  expect(editor.componentProps?.['$view:report:View:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Allowed:hidden:Configured',
  });
  expect(editor.dynamicComponentProps).toBe(true);
  const preview = await kit.content.api.previewEditor(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: document.revision,
    intent: 'update',
    data: { title: 'Edited' },
  });
  expect(preview.componentProps?.['notice#notice:Field:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Edited:hidden:Configured',
  });
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata.componentProps['title#title:Filter:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Empty:hidden:Configured',
  });
  expect(metadata.dataSchema).toHaveProperty('properties.title');
  expect(metadata.dataSchema).not.toHaveProperty('properties.notice');
  const history = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: document.id,
    versionId: document.versionId,
  });
  expect(history.componentProps?.['title#title:Diff:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Allowed:hidden:Configured',
  });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }))
      .data['title'],
  ).toBe('Allowed');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      data: { notice: 'Not stored' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const withoutUi = collections.map((collection) =>
    collection.key === 'articles'
      ? { ...collection, fields: collection.fields.filter((field) => field.type !== 'ui') }
      : collection,
  );
  const other = createRegistry({
    collections: withoutUi,
    adminComponents: registrations,
    limits: contentLimits(),
  });
  expect(generateArtifacts(kit.registry).mapping.get('articles').fingerprint).toBe(
    generateArtifacts(other).mapping.get('articles').fingerprint,
  );
  expect(kit.registry.behaviorHash).not.toBe(other.behaviorHash);
});

it('invalid or timed out registered props fail without persisting candidate changes or holding the transaction', async () => {
  const collections = workflowCollections();
  contentField(contentCollection(collections, 'articles'), 'title').admin = {
    components: { Field: reference },
  };
  let mode: 'valid' | 'invalid' | 'waiting' = 'valid';
  let cancelled = false;
  const configured = registration();
  configured.resolveProps = {
    version: 'states',
    run: ({ signal }) => {
      if (mode === 'invalid') return Promise.resolve({ caption: 7 });
      if (mode === 'valid') return Promise.resolve({ caption: 'Allowed' });
      return new Promise((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            cancelled = true;
            resolve({ caption: 'Cancelled' });
          },
          { once: true },
        );
      });
    },
  };
  const kit = await fixture(collections, [configured], { maxHookDurationMs: 30 });
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  mode = 'invalid';
  await expect(
    kit.content.api.previewEditor(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      intent: 'update',
      data: { title: 'Candidate' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  mode = 'waiting';
  await expect(
    kit.content.api.getEditor(kit.owner(), {
      collection: 'articles',
      id: document.id,
      intent: 'update',
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(cancelled).toBe(true);
  mode = 'valid';
  expect(
    (
      await kit.content.api.getEditor(kit.owner(), {
        collection: 'articles',
        id: document.id,
        intent: 'update',
      })
    ).componentProps?.['title#title:Field:site/presentation'],
  ).toEqual({ prefix: 'Configured', caption: 'Allowed' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }))
      .data['title'],
  ).toBe('Original');
});

it('props callbacks share the request invocation budget', async () => {
  const collections = workflowCollections();
  contentField(contentCollection(collections, 'articles'), 'title').admin = {
    components: { Field: reference },
  };
  const kit = await fixture(collections, [registration()], { maxHookCalls: 1 });
  await expect(
    kit.content.api.getEditor(kit.owner(), { collection: 'articles', intent: 'create' }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});

it('UI-only cells and filters have authorized props without requiring a Field component or stored value', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    {
      id: 'reporter',
      name: 'reporter',
      type: 'ui',
      admin: {
        disabled: { field: true },
        components: { Cell: reference, Filter: reference, beforeInput: [reference] },
      },
    },
  ];
  articles.admin = { defaultColumns: ['reporter'] };
  const configured = registration();
  configured.slots = [...configured.slots, 'beforeInput'];
  const kit = await fixture(collections, [configured]);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible' },
  });
  expect(document.data).not.toHaveProperty('reporter');
  expect(document.componentProps?.['reporter#reporter:Cell:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Visible:hidden:Configured',
  });
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata.fields.find((field) => field.path === 'reporter')).toMatchObject({
    type: 'ui',
    queryable: false,
    sortable: false,
    disabled: { field: true, bulkEdit: true },
  });
  expect(metadata.admin?.defaultColumns).toEqual(['reporter']);
  expect(metadata.componentProps['reporter#reporter:Filter:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Empty:hidden:Configured',
  });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: document.id,
    intent: 'update',
  });
  expect(editor.layout.find((node) => node.id === 'reporter')?.disabled?.field).toBe(true);
});

it('localized singular, plural, field, block and tab labels reach the editor and metadata', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.labels = {
    singular: { en: 'Article', zh: '文章' },
    plural: { en: 'Stories', zh: '文章列表' },
  };
  contentField(articles, 'title').label = { en: 'Title', zh: '标题' };
  articles.fields = [
    ...articles.fields,
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [{ id: 'section', key: 'section', label: { en: 'Section', zh: '区块' }, fields: [] }],
    },
    {
      id: 'tabs',
      type: 'tabs',
      tabs: [
        {
          id: 'details',
          label: { en: 'Details', zh: '详情' },
          fields: [{ id: 'note', name: 'note', type: 'text' }],
        },
      ],
    },
  ];
  const kit = await fixture(collections, []);
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata.label).toBe('Stories');
  expect(metadata.labels).toEqual({ singular: 'Article', plural: 'Stories' });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    intent: 'create',
  });
  expect(editor.layout.find((node) => node.id === 'title')?.label).toBe('标题');
  expect(editor.layout.find((node) => node.id === 'blocks')?.blocks?.[0]?.label).toBe('区块');
  expect(editor.layout.find((node) => node.id === 'tabs')?.tabs?.[0]?.label).toBe('详情');
});

it('repeated registered input and edit slots keep separate validated props through the public editor API', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  const refs = ['First', 'Second'].map((caption) => ({
    id: reference.id,
    props: { prefix: 'Configured', caption },
  }));
  article.admin = { components: { beforeEdit: refs } };
  contentField(article, 'title').admin = { components: { beforeInput: refs } };
  const configured = registration();
  configured.slots = [...configured.slots, 'beforeInput', 'beforeEdit'];
  configured.resolveProps = {
    version: 'configured-caption',
    run: ({ props }) => Promise.resolve({ caption: props['caption'] ?? '' }),
  };
  const kit = await fixture(collections, [configured]);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  for (const [instance, caption] of ['First', 'Second'].entries()) {
    expect(
      editor.componentProps?.[`title#title:beforeInput:site/presentation:${instance}`],
    ).toEqual({ prefix: 'Configured', caption });
    expect(editor.componentProps?.[`$collection:beforeEdit:site/presentation:${instance}`]).toEqual(
      { prefix: 'Configured', caption },
    );
  }
});
it('cancelling registered props interrupts the active resolver and releases the editor transaction', async () => {
  const collections = workflowCollections();
  contentField(contentCollection(collections, 'articles'), 'title').admin = {
    components: { Field: reference },
  };
  let waiting = true;
  let signal: AbortSignal | undefined;
  const entered = Promise.withResolvers<void>();
  const configured = registration();
  configured.resolveProps = {
    version: 'cancellable',
    run: (context) => {
      if (!waiting) return Promise.resolve({ caption: 'Ready' });
      ({ signal } = context);
      entered.resolve();
      return new Promise((resolve) => {
        context.signal?.addEventListener('abort', () => resolve({ caption: 'Cancelled' }), {
          once: true,
        });
      });
    },
  };
  const kit = await fixture(collections, [configured]);
  const cancellation = new AbortController();
  const response = kit.content.api.getEditor(
    { ...kit.owner(), signal: cancellation.signal },
    { collection: 'articles', intent: 'create' },
  );
  const result = response.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
  await entered.promise;
  cancellation.abort();
  expect(await result).toMatchObject({ ok: false, error: { code: 'temporarily_unavailable' } });
  expect(signal?.aborted).toBe(true);
  waiting = false;
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(editor.componentProps?.['title#title:Field:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Ready',
  });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});
it('missing optional values still supply Cell props while denied fields and UI descendants of denied groups do not', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    { id: 'optional', name: 'optional', type: 'text', admin: { components: { Cell: reference } } },
    {
      id: 'hidden',
      name: 'hidden',
      type: 'text',
      access: { read: { version: 'denied', run: () => Promise.resolve(false) } },
      admin: { components: { Cell: reference } },
    },
    {
      id: 'private',
      name: 'private',
      type: 'group',
      access: { read: { version: 'denied', run: () => Promise.resolve(false) } },
      fields: [
        {
          id: 'private_notice',
          name: 'notice',
          type: 'ui',
          admin: { components: { Cell: reference } },
        },
      ],
    },
  ];
  const kit = await fixture(collections, [registration()]);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible', hidden: 'Private', private: {} },
  });
  expect(document.componentProps?.['optional#optional:Cell:site/presentation']).toEqual({
    prefix: 'Configured',
    caption: 'Visible:hidden:Configured',
  });
  expect(document.componentProps).not.toHaveProperty('hidden#hidden:Cell:site/presentation');
  expect(document.componentProps).not.toHaveProperty(
    'private.notice#private_notice:Cell:site/presentation',
  );
  expect(document.data).not.toHaveProperty('private');
});
