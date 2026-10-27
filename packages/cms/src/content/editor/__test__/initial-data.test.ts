import { expect, it } from 'vitest';
import { workflowCollections } from '../../../../../../test/support/content-runtime.ts';
import { article, fixture } from './support.ts';

it('returns safe async defaults on the first create form and persists the displayed values without recomputing them', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  let calls = 0;
  let privateCalls = 0;
  definition.fields = [
    ...definition.fields.map((field) =>
      field.name === 'title'
        ? {
            ...field,
            defaultValue: {
              version: 'title-locale',
              run: ({ locale }: { locale: string }) => {
                calls += 1;
                return Promise.resolve(locale === 'zh' ? '默认标题' : 'Default title');
              },
            },
          }
        : field,
    ),
    { id: 'zero', name: 'zero', type: 'number', defaultValue: 0 },
    { id: 'enabled', name: 'enabled', type: 'boolean', defaultValue: false },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      defaultValue: { version: 'row', run: () => Promise.resolve([{ label: 'Initial row' }]) },
      fields: [{ id: 'row_label', name: 'label', type: 'text' }],
    },
    {
      id: 'private',
      name: 'private',
      type: 'text',
      defaultValue: {
        version: 'private',
        run: () => {
          privateCalls += 1;
          return Promise.resolve('Secret');
        },
      },
      access: { read: { version: 'hidden', run: () => false } },
    },
  ];
  const kit = await fixture(collections);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    locale: 'zh',
    mode: 'editing',
  });
  expect(editor.initialData).toMatchObject({
    title: '默认标题',
    zero: 0,
    enabled: false,
    rows: [{ label: 'Initial row' }],
  });
  const rows = editor.initialData?.['rows'];
  if (!Array.isArray(rows)) throw new Error('Missing initial rows');
  expect(rows[0]).toHaveProperty('id', expect.stringMatching(/^[a-f0-9-]{36}$/));
  expect(editor.initialData).not.toHaveProperty('private');
  expect(JSON.stringify(editor)).not.toContain('title-locale');
  expect(JSON.stringify(editor)).not.toContain('Secret');
  expect(calls).toBe(1);
  expect(privateCalls).toBe(0);
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    data: editor.initialData,
  });
  expect(created.data).toEqual(editor.initialData);
  expect(calls).toBe(1);
  expect(privateCalls).toBe(1);
  const existing = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: created.id,
    intent: 'update',
    locale: 'zh',
    mode: 'editing',
  });
  expect(existing.initialData).toBeNull();
});

it('does not run candidate validators while describing a blank create form', async () => {
  const collections = workflowCollections();
  const definition = article(collections);
  definition.drafts = { ...definition.drafts, validate: true };
  definition.fields = definition.fields.map((field) =>
    field.name === 'title'
      ? {
          ...field,
          defaultValue: { version: 'empty', run: () => Promise.resolve('') },
          validate: { version: 'requires-value', run: (value) => Promise.resolve(value !== '') },
        }
      : field,
  );
  const kit = await fixture(collections);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    mode: 'editing',
  });
  expect(editor.initialData).toEqual({ title: '' });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: editor.initialData,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
