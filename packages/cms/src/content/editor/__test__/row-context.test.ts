import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import type { AdminComponentRegistration } from '../../collections/admin-types.ts';
const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
it('regression: row and block props receive stable row scope rather than the parent array', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      admin: { components: { RowLabel: 'site/row' } },
      blocks: [
        {
          id: 'section',
          key: 'section',
          label: 'Section',
          admin: { components: { Block: 'site/row', Label: 'site/row' } },
          fields: [{ id: 'heading', name: 'heading', type: 'text' }],
        },
      ],
    },
  ];
  const row: AdminComponentRegistration = {
    id: 'site/row',
    version: '1',
    slots: ['RowLabel', 'Block', 'Label'],
    validateProps: {
      version: 'caption',
      run: ({ props }) => Promise.resolve(typeof props['caption'] === 'string'),
    },
    resolveProps: {
      version: 'row',
      run: (context) =>
        Promise.resolve({
          caption:
            context.siblingData['heading'] === 'Section title' &&
            context.blockData?.['blockType'] === 'section' &&
            context.path === 'blocks.10000000-0000-4000-8000-000000000003' &&
            typeof context.documentId === 'string' &&
            Object.isFrozen(context.siblingData)
              ? 'Section title'
              : 'Missing row scope',
        }),
    },
  };
  const kit = await createContentFixture({ collections, adminComponents: [row] });
  fixtures.push(kit);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Rows',
      blocks: [
        {
          id: '10000000-0000-4000-8000-000000000003',
          blockType: 'section',
          heading: 'Section title',
        },
      ],
    },
  });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: document.id,
    intent: 'update',
  });
  expect(
    editor.componentProps?.['blocks.10000000-0000-4000-8000-000000000003#blocks:RowLabel:site/row'],
  ).toEqual({ caption: 'Section title' });
  expect(
    editor.componentProps?.['blocks.10000000-0000-4000-8000-000000000003#section:Block:site/row'],
  ).toEqual({ caption: 'Section title' });
  expect(
    editor.componentProps?.['blocks.10000000-0000-4000-8000-000000000003#section:Label:site/row'],
  ).toEqual({ caption: 'Section title' });
});
