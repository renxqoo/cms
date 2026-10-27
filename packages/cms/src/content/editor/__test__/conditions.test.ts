import { expect, it } from 'vitest';
import { workflowCollections } from '../../../../../../test/support/content-runtime.ts';
import { createContent } from '../../composition.ts';
import { article, fixture, retain } from './support.ts';

const rowId = '10000000-0000-4000-8000-000000000001';

it('previews live conditions with an unchanged read-only value and preserves hidden field data without saving', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.fields = [
    ...definition.fields,
    { id: 'enabled', name: 'enabled', type: 'boolean' },
    {
      id: 'locked',
      name: 'locked',
      type: 'text',
      defaultValue: 'Readonly',
      access: { write: { version: 'locked', run: () => false } },
    },
    {
      id: 'detail',
      name: 'detail',
      type: 'text',
      admin: {
        condition: {
          version: 'enabled',
          run: ({ data }) => Promise.resolve(data['enabled'] === true),
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
  });
  expect(editor.visibility['detail#detail']).toBe(false);
  const preview = await kit.content.api.previewEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
    initialSnapshot: editor.initialSnapshot,
    data: { ...editor.initialData, title: 'New', enabled: true, detail: 'Retained' },
  });
  expect(preview.visibility['detail#detail']).toBe(true);
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});

it('accepts a full form containing unchanged read-only data while rejecting a change and stale revisions', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.fields = definition.fields.map((field) =>
    field.name === 'score'
      ? {
          ...field,
          access: {
            write: {
              version: 'only-create',
              run: ({ operation }) => operation === 'documents.create',
            },
          },
        }
      : field,
  );
  definition.fields = [
    ...definition.fields,
    { id: 'enabled', name: 'enabled', type: 'boolean' },
    {
      id: 'detail',
      name: 'detail',
      type: 'text',
      admin: { condition: { version: 'enabled', run: ({ data }) => data['enabled'] === true } },
    },
  ];
  const kit = await fixture(collections);
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Stored', score: 2, enabled: true, detail: 'Keep me' },
  });
  const values = {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
    intent: 'update',
    mode: 'editing',
  };
  expect(
    (
      await kit.content.api.previewEditor(kit.owner(), {
        ...values,
        data: { ...created.data, enabled: false },
      })
    ).visibility['detail#detail'],
  ).toBe(false);
  await expect(
    kit.content.api.previewEditor(kit.owner(), { ...values, data: { ...created.data, score: 3 } }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.previewEditor(kit.owner(), {
      ...values,
      revision: created.revision + 1,
      data: created.data,
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const stored = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
  });
  expect(stored.data).toEqual(created.data);
  expect(stored.revision).toBe(created.revision);
});

it('resolves sibling and nearest-block data by stable row identities and supports display wrappers', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.fields = [
    ...definition.fields,
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'row_enabled', name: 'enabled', type: 'boolean' },
        {
          id: 'row_label',
          name: 'label',
          type: 'text',
          admin: {
            condition: {
              version: 'row-enabled',
              run: ({ siblingData, path }) =>
                siblingData['enabled'] === true && path === `rows.${rowId}.label`,
            },
          },
        },
      ],
    },
    {
      id: 'layout',
      name: 'layout',
      type: 'blocks',
      blocks: [
        {
          id: 'hero',
          key: 'hero',
          label: 'Hero',
          fields: [
            { id: 'hero_enabled', name: 'enabled', type: 'boolean' },
            {
              id: 'hero_label',
              name: 'label',
              type: 'text',
              admin: {
                condition: {
                  version: 'block',
                  run: ({ blockData }) =>
                    blockData?.['enabled'] === true && blockData['blockType'] === 'hero',
                },
              },
            },
          ],
        },
      ],
    },
    {
      id: 'details_wrapper',
      type: 'collapsible',
      admin: { condition: { version: 'root-title', run: ({ data }) => data['title'] === 'Show' } },
      fields: [{ id: 'note', name: 'note', type: 'text' }],
    },
  ];
  const kit = await fixture(collections);
  const result = await kit.content.api.previewEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
    data: {
      title: 'Show',
      rows: [{ id: rowId, enabled: true, label: 'Row' }],
      layout: [{ id: rowId, blockType: 'hero', enabled: true, label: 'Hero' }],
      note: 'Note',
    },
  });
  expect(result.visibility).toEqual({
    [`rows.${rowId}.label#row_label`]: true,
    [`layout.${rowId}.label#hero_label`]: true,
    '#details_wrapper': true,
  });
});

it('regression: hidden values cannot be probed through condition booleans or injected through candidate data', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.fields = [
    ...definition.fields,
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: { read: { version: 'hidden', run: () => false } },
    },
    {
      id: 'probe',
      name: 'probe',
      type: 'text',
      admin: {
        condition: {
          version: 'safe-data',
          run: ({ data, siblingData }) =>
            data['secret'] === 'Private' || siblingData['secret'] === 'Private',
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Public', secret: 'Private' },
  });
  const values = {
    collection: 'articles',
    intent: 'update',
    id: created.id,
    revision: created.revision,
    mode: 'editing',
  };
  expect(
    (await kit.content.api.previewEditor(kit.owner(), { ...values, data: created.data }))
      .visibility['probe#probe'],
  ).toBe(false);
  for (const secret of ['Private', 'Wrong'])
    await expect(
      kit.content.api.previewEditor(kit.owner(), { ...values, data: { ...created.data, secret } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('a timed-out condition aborts its signal and releases the transaction for another request', async () => {
  const collections = workflowCollections();
  let aborted = false;
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'detail',
      name: 'detail',
      type: 'text',
      admin: {
        condition: {
          version: 'never',
          run: ({ signal }) => {
            signal?.addEventListener(
              'abort',
              () => {
                aborted = true;
              },
              { once: true },
            );
            return new Promise(() => {});
          },
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const options = { ...kit.contentOptions, limits: { ...kit.limits, maxHookDurationMs: 30 } };
  const content = retain(createContent(options));
  await expect(
    content.api.previewEditor(kit.owner(), {
      collection: 'articles',
      intent: 'create',
      mode: 'editing',
      data: { title: 'Title' },
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(aborted).toBe(true);
  expect((await content.api.getCollection(kit.owner(), { collection: 'articles' })).key).toBe(
    'articles',
  );
});

it('cancelling a condition preview aborts the callback and releases its transaction without changing data', async () => {
  const collections = workflowCollections();
  const entered = Promise.withResolvers<void>();
  let waiting = true;
  let conditionSignal: AbortSignal | undefined;
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'detail',
      name: 'detail',
      type: 'text',
      admin: {
        condition: {
          version: 'cancel',
          run: ({ signal }) => {
            if (!waiting) return true;
            conditionSignal = signal;
            entered.resolve();
            return new Promise(() => {});
          },
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const controller = new AbortController();
  const running = kit.content.api.previewEditor(
    { ...kit.owner(), signal: controller.signal },
    { collection: 'articles', intent: 'create', mode: 'editing', data: { title: 'Candidate' } },
  );
  const outcome = running.catch((error: unknown) => error);
  await entered.promise;
  controller.abort();
  expect(await outcome).toMatchObject({ code: 'temporarily_unavailable' });
  expect(conditionSignal?.aborted).toBe(true);
  waiting = false;
  expect(
    (
      await kit.content.api.previewEditor(kit.owner(), {
        collection: 'articles',
        intent: 'create',
        mode: 'editing',
        data: { title: 'Next' },
      })
    ).visibility['detail#detail'],
  ).toBe(true);
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});
