import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import { createRegistry, generateArtifacts, generateEvolution } from '../generate.ts';
import { contentLimits } from '../../../../../test/support/content.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

function collections() {
  const definitions = workflowCollections();
  const articles = contentCollection(definitions, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'aliases', name: 'aliases', type: 'text', localized: true, hasMany: true, maxRows: 4 },
    { id: 'scores', name: 'scores', type: 'number', hasMany: true, min: 0, max: 10 },
    {
      id: 'tone',
      name: 'tone',
      type: 'radio',
      options: [{ value: 'calm', label: { en: 'Calm', zh: '平静' } }, 'bold'],
    },
  ];
  return definitions;
}

it('persists primitive arrays and radio values through publication, queries and immutable history', async () => {
  const kit = await createContentFixture({ collections: collections() });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'Options', aliases: ['same', 'same'], scores: [0, 10, 0], tone: 'calm' },
      zh: { title: '中文', aliases: ['甲', '乙'] },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  const edited = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    locale: 'zh',
    data: { aliases: ['乙', '甲'], scores: [3, 1], tone: 'bold' },
  });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      locale: 'en',
      mode: 'published',
    }),
  ).toMatchObject({ data: { aliases: ['same', 'same'], scores: [0, 10, 0], tone: 'calm' } });
  expect(
    await kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      locale: 'zh',
      where: { field: 'aliases', operator: 'all', value: ['甲', '乙'] },
    }),
  ).toMatchObject({ total: 1, rows: [{ data: { aliases: ['乙', '甲'] } }] });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: first.id,
    locale: 'zh',
    intent: 'update',
  });
  expect(editor.layout.find((field) => field.name === 'aliases')).toMatchObject({
    type: 'text',
    constraints: { hasMany: true, maxRows: 4 },
  });
  expect(editor.layout.find((field) => field.name === 'tone')).toMatchObject({
    type: 'radio',
    constraints: { options: [{ value: 'calm', label: { en: 'Calm', zh: '平静' } }, 'bold'] },
  });
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: edited.revision,
    versionId: first.versionId,
  });
  expect(restored.data).toMatchObject({
    aliases: ['same', 'same'],
    scores: [0, 10, 0],
    tone: 'calm',
  });
});

it('changes presentation labels without requiring a data schema migration or altering generated values', () => {
  const before = collections();
  const registry = createRegistry({ collections: before, limits: contentLimits() });
  const { snapshot } = generateArtifacts(registry);
  const next = collections();
  const articles = contentCollection(next, 'articles');
  articles.fields = articles.fields.map((field) =>
    field.name === 'tone'
      ? {
          ...field,
          options: [
            { value: 'calm', label: 'Serene' },
            { value: 'bold', label: 'Strong' },
          ],
        }
      : field,
  );
  const changed = createRegistry({ collections: next, limits: contentLimits() });
  const evolution = generateEvolution({ previous: snapshot, registry: changed });
  expect(evolution.requiresMigration).toBe(false);
  expect(changed.behaviorHash).not.toBe(registry.behaviorHash);
});
