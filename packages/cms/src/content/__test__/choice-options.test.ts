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
async function fixture() {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'kind', name: 'kind', type: 'text' },
    {
      id: 'choice',
      name: 'choice',
      type: 'select',
      options: ['a', 'b'],
      filterOptions: {
        version: 'kind',
        run: ({ siblingData, options }) => options.filter((value) => value === siblingData['kind']),
      },
    },
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        { id: 'a_block', key: 'a', label: 'A', fields: [] },
        { id: 'b_block', key: 'b', label: 'B', fields: [] },
      ],
      filterOptions: { version: 'kind', run: ({ data }) => (data['kind'] === 'a' ? ['a'] : false) },
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('filters unsaved select and block candidates with safe context and rejects a previously allowed stored choice after its dependency changes', async () => {
  const kit = await fixture();
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(editor.choiceOptions).toEqual({ 'choice#choice': [], 'blocks#blocks': [] });
  const candidate = await kit.content.api.previewEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
    data: { kind: 'a' },
  });
  expect(candidate.choiceOptions).toEqual({ 'choice#choice': ['a'], 'blocks#blocks': ['a'] });
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Choices', kind: 'a', choice: 'a', blocks: [{ blockType: 'a' }] },
  });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: created.id,
      revision: created.revision,
      data: { kind: 'b' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input', fieldErrors: [{ field: 'choice' }] });
  const read = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
  });
  expect(read.revision).toBe(created.revision);
  expect(read.data['kind']).toBe('a');
  const changed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
    data: { kind: 'b', choice: 'b', blocks: [] },
  });
  expect(changed.data['choice']).toBe('b');
});

it('reports forbidden block choices at the field path through independent validation and rolls back saves', async () => {
  const kit = await fixture();
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Invalid', kind: 'a', blocks: [{ blockType: 'b' }] },
    }),
  ).toMatchObject({ valid: false, errors: [{ field: 'blocks' }] });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Invalid', kind: 'a', blocks: [{ blockType: 'b' }] },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input', fieldErrors: [{ field: 'blocks' }] });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});
