import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture(validate = false) {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.drafts = { ...articles.drafts, validate };
  articles.fields = [
    ...articles.fields,
    { id: 'enabled', name: 'enabled', type: 'boolean' },
    {
      id: 'conditional_row',
      type: 'row',
      admin: { condition: { version: 'enabled', run: ({ data }) => data['enabled'] === true } },
      fields: [
        {
          id: 'conditional_value',
          name: 'conditionalValue',
          type: 'text',
          required: true,
          validate: { version: 'good', run: (value) => value === 'good' },
        },
      ],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'row_enabled', name: 'enabled', type: 'boolean' },
        {
          id: 'row_value',
          name: 'value',
          type: 'text',
          required: true,
          admin: {
            condition: {
              version: 'row-enabled',
              run: ({ siblingData }) => siblingData['enabled'] === true,
            },
          },
        },
      ],
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('does not require or run custom validators for hidden conditional fields but preserves strict value types', async () => {
  const kit = await fixture(true);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Conditional', enabled: false, conditionalValue: 'bad' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: published.revision,
      data: { enabled: true },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input', fieldErrors: [{ field: 'conditionalValue' }] });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: published.revision,
      data: { conditionalValue: 5 },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input', fieldErrors: [{ field: 'conditionalValue' }] });
  const fixed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    data: { enabled: true, conditionalValue: 'good' },
  });
  expect(
    (
      await kit.content.api.publishDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        revision: fixed.revision,
      })
    ).data,
  ).toMatchObject({ enabled: true, conditionalValue: 'good' });
});

it('evaluates required conditions against each sibling row and reports the stable failing path', async () => {
  const kit = await fixture();
  const id = '10000000-0000-4000-8000-000000000099';
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Rows', enabled: false, rows: [{ id, enabled: false }] },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  const draft = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    data: { rows: [{ id, enabled: true }] },
  });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: draft.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input', fieldErrors: [{ field: `rows.${id}.value` }] });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      mode: 'published',
    }),
  ).toMatchObject({ versionId: first.versionId, data: { rows: [{ id, enabled: false }] } });
});
