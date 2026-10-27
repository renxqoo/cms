import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture() {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'show', name: 'show', type: 'boolean' },
    {
      id: 'detail',
      name: 'detail',
      type: 'text',
      admin: { condition: { version: 'show', run: ({ data }) => data['show'] === true } },
    },
    { id: 'kind', name: 'kind', type: 'text' },
    {
      id: 'choice',
      name: 'choice',
      type: 'select',
      options: ['a', 'b'],
      filterOptions: {
        version: 'kind',
        run: ({ data, options }) => options.filter((option) => option === data['kind']),
      },
      admin: { components: { Field: 'candidate-choice' } },
    },
  ];
  const kit = await createContentFixture({
    collections,
    adminComponents: [
      {
        id: 'candidate-choice',
        version: '1',
        slots: ['Field'],
        resolveProps: { version: 'kind', run: ({ data }) => ({ kind: data['kind'] ?? null }) },
        validateProps: { version: 'kind', run: ({ props }) => typeof props['kind'] === 'string' },
      },
    ],
  });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'First', show: true, kind: 'a' },
  });
  const second = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Second', show: false, kind: 'b' },
  });
  const candidates = [first, second].map((document) => ({
    collection: 'articles',
    intent: 'update',
    id: document.id,
    revision: document.revision,
    data: {},
  }));
  return { kit, candidates };
}

it('intersects each document condition, choice list and safe component props before bulk editing', async () => {
  const { kit, candidates } = await fixture();
  const initial = await kit.content.api.previewEditor(kit.owner(), {
    collection: 'articles',
    candidates,
  });
  expect(initial.visibility['detail#detail']).toBe(false);
  expect(initial.choiceOptions?.['choice#choice']).toEqual([]);
  expect(Object.values(initial.componentProps ?? {})).not.toContainEqual({ kind: 'a' });
  const next = await kit.content.api.previewEditor(kit.owner(), {
    collection: 'articles',
    candidates: candidates.map((candidate) => ({ ...candidate, data: { show: true, kind: 'a' } })),
  });
  expect(next.visibility['detail#detail']).toBe(true);
  expect(next.choiceOptions?.['choice#choice']).toEqual(['a']);
  expect(Object.values(next.componentProps ?? {})).toContainEqual({ kind: 'a' });
});

it('rejects any stale bulk candidate or a mismatched source collection instead of returning a partially authorized presentation', async () => {
  const { kit, candidates } = await fixture();
  await expect(
    kit.content.api.previewEditor(kit.owner(), {
      collection: 'articles',
      candidates: candidates.map((candidate, index) => ({
        ...candidate,
        revision: candidate.revision + index,
      })),
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await expect(
    kit.content.api.previewEditor(kit.owner(), { collection: 'pages', candidates }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
