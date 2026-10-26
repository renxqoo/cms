import { afterEach, expect, it } from 'vitest';
import { createContent } from '../composition.ts';
import type { ContentOptions } from '../composition.ts';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { ContentLocaleSource } from '../definition.ts';
import { createRegistry, generateArtifacts, generateEvolution } from '../generate.ts';
import { contentLimits } from '../../../../../test/support/content.ts';

const fixtures: ContentFixture[] = [];
async function fixture() {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing article fixture');
  article.localeSource = 'siteLanguages';
  article.publicationLocalesField = 'contentLocales';
  article.fields = [
    ...article.fields,
    { id: 'content_locales', name: 'contentLocales', type: 'json', required: true },
    { id: 'localized_key', name: 'localizedKey', type: 'text', localized: true, unique: true },
  ];
  let resolverCalls = 0;
  let languages: ContentLocaleSource = {
    default: 'en',
    supported: ['en', 'zh', 'fr'],
    fallback: { zh: ['en'], fr: ['en'] },
    enabled: ['en', 'zh', 'fr'],
  };
  const kit = await createContentFixture({
    collections,
    compose(options) {
      const configured: ContentOptions = {
        ...options,
        async resolveLocaleSource(source, tx) {
          resolverCalls += 1;
          expect(source).toBe('siteLanguages');
          await tx.query('SELECT 1');
          return languages;
        },
      };
      return {
        content: createContent(configured),
        options: configured,
        close: () => Promise.resolve(),
      };
    },
  });
  fixtures.push(kit);
  return {
    ...kit,
    resolverCalls: () => resolverCalls,
    setLanguages(next: ContentLocaleSource) {
      languages = next;
    },
  };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('edits newly registered languages without rebuilding the registry and preserves them across other-language saves', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'fr',
    data: { title: 'Français', slug: 'dynamic', contentLocales: ['fr'] },
  });
  const next = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'en',
    data: { title: 'English' },
  });
  const french = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    locale: 'fr',
    fallback: [],
  });
  expect(french.data['title']).toBe('Français');
  expect(next.data['title']).toBe('English');
  expect(kit.registry.get('articles').locales.supported).toEqual(['en', 'zh']);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: first.id,
    locale: 'fr',
    intent: 'update',
    mode: 'editing',
  });
  expect(editor.locales.supported).toEqual(['en', 'zh', 'fr']);
  expect(editor.locales.enabled).toEqual(['en', 'zh', 'fr']);
  expect(editor.publicationLocalesField).toBe('contentLocales');
});

it('publishes only selected complete languages atomically without filling missing translations from fallback', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'English', slug: 'selected', contentLocales: ['en'] },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  expect(published.publishedVersionId).toBe(first.versionId);
  const draft = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    data: { contentLocales: ['en', 'fr'] },
  });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: draft.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const publicEnglish = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    mode: 'published',
    locale: 'en',
  });
  expect(publicEnglish.data['contentLocales']).toEqual(['en']);
});

it('retains disabled language history and unique values while exposing disabled state in editor metadata', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'fr',
    data: { title: 'Conservé', slug: 'disabled', contentLocales: ['fr'] },
  });
  kit.setLanguages({
    default: 'en',
    supported: ['en', 'zh', 'fr'],
    fallback: {},
    enabled: ['en', 'zh'],
  });
  const history = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    versionId: first.versionId,
    locale: 'fr',
  });
  expect(history.data['title']).toBe('Conservé');
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: first.id,
    locale: 'fr',
    intent: 'read',
    mode: 'editing',
  });
  expect(editor.locales.enabled).toEqual(['en', 'zh']);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Other', slug: 'disabled', contentLocales: ['en'] },
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
});

it.each([[], ['en', 'en'], ['unknown'], [null], 'en', null])(
  'rejects invalid selected publication languages %j',
  async (contentLocales) => {
    const kit = await fixture();
    const first = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'English', contentLocales },
    });
    await expect(
      kit.content.api.publishDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        revision: first.revision,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  },
);

it('preserves disabled localized unique values and queries newly registered-language indexes', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'fr',
    data: { title: 'Recherche française', localizedKey: 'retenu', contentLocales: ['fr'] },
  });
  const page = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    locale: 'fr',
    q: 'française',
    fallback: [],
  });
  expect(page.rows.map((row) => row.id)).toEqual([first.id]);
  kit.setLanguages({ default: 'en', supported: ['en', 'zh', 'fr'], fallback: {}, enabled: ['en'] });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'en',
    data: { title: 'English update' },
  });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      locale: 'fr',
      data: { title: 'Autre', localizedKey: 'retenu', contentLocales: ['fr'] },
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
});

it('resolves relation targets and restoration against the same registered language source', async () => {
  const kit = await fixture();
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'fr',
    data: { title: 'Cible française', contentLocales: ['fr'] },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'fr',
    data: {
      title: 'Source',
      related: [{ collection: 'articles', id: target.id }],
      contentLocales: ['fr'],
    },
  });
  const expanded = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    locale: 'fr',
    depth: 1,
  });
  expect(kit.resolverCalls()).toBe(3);
  expect(expanded.data['related']).toMatchObject([
    { id: target.id, data: { title: 'Cible française' } },
  ]);
  const changed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    locale: 'fr',
    data: { title: 'Changed' },
  });
  await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: changed.revision,
    versionId: source.versionId,
    locale: 'fr',
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: source.id,
        locale: 'fr',
        fallback: [],
      })
    ).data['title'],
  ).toBe('Source');
});

it('accepts newly selected complete languages and leaves newly registered languages out of existing publications', async () => {
  const kit = await fixture();
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', contentLocales: ['en', 'fr'] },
      fr: { title: 'Français' },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
  });
  kit.setLanguages({
    default: 'en',
    supported: ['en', 'zh', 'fr', 'de'],
    fallback: {},
    enabled: ['en', 'zh', 'fr', 'de'],
  });
  const publicFrench = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    locale: 'fr',
    mode: 'published',
    fallback: [],
  });
  expect(publicFrench.data['title']).toBe('Français');
  expect(publicFrench.data['contentLocales']).toEqual(['en', 'fr']);
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: created.id,
      revision: published.revision,
    }),
  ).resolves.toHaveProperty('publishedVersionId', created.versionId);
});

it('refreshes the registered source between requests and uses one resolved catalog inside each operation', async () => {
  const kit = await fixture();
  const before = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(before.locales).toEqual(['en', 'zh', 'fr']);
  kit.setLanguages({
    default: 'fr',
    supported: ['en', 'zh', 'fr', 'de'],
    fallback: {},
    enabled: ['fr', 'de'],
  });
  const after = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(after.defaultLocale).toBe('fr');
  expect(after.locales).toEqual(['en', 'zh', 'fr', 'de']);
  expect(kit.registry.get('articles').locales.default).toBe('en');
});

it.each<ContentLocaleSource>([
  { default: 'en', supported: ['en', 'en'], fallback: {}, enabled: ['en'] },
  { default: 'en', supported: ['en'], fallback: {}, enabled: [] },
  { default: 'fr', supported: ['en'], fallback: {}, enabled: ['en'] },
  { default: 'en', supported: ['en'], fallback: { en: ['en'] }, enabled: ['en'] },
  { default: 'en', supported: ['en'], fallback: { fr: ['en'] }, enabled: ['en'] },
  { default: 'en', supported: ['en'], fallback: { en: ['fr'] }, enabled: ['en'] },
  { default: 'en', supported: ['en'], fallback: {}, enabled: ['en', 'en'] },
  { default: 'en', supported: ['en'], fallback: {}, enabled: ['en', 'fr'] },
])('rejects invalid transaction-local language sources %j', async (locales) => {
  const kit = await fixture();
  kit.setLanguages(locales);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Rejected' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await kit.database.query('SELECT id FROM content_documents')).rowCount).toBe(0);
});

it('requires the configured locale resolver before serving dynamic collections', async () => {
  const kit = await fixture();
  const options = { ...kit.contentOptions };
  delete options.resolveLocaleSource;
  expect(() => createContent(options)).toThrow('Content locale source resolver is missing');
});

it('keeps dynamic language catalog changes outside physical schema evolution while retaining source identity', () => {
  const definitions = workflowCollections();
  const [first] = definitions;
  if (!first) throw new Error('Missing articles');
  first.localeSource = 'siteLanguages';
  const before = createRegistry({ collections: definitions, limits: contentLimits() });
  first.locales = { default: 'fr', supported: ['en', 'zh', 'fr'], fallback: {} };
  const after = createRegistry({ collections: definitions, limits: contentLimits() });
  const evolution = generateEvolution({
    previous: generateArtifacts(before).snapshot,
    registry: after,
  });
  expect(evolution.requiresMigration).toBe(false);
  first.localeSource = 'otherLanguages';
  const changed = createRegistry({ collections: definitions, limits: contentLimits() });
  expect(
    generateEvolution({ previous: generateArtifacts(before).snapshot, registry: changed })
      .requiresMigration,
  ).toBe(true);
});

it('rejects oversized, malformed and duplicate fallback catalogs without caching them into later requests', async () => {
  const kit = await fixture();
  for (const languages of [
    { default: 'en', supported: ['en', 'invalid locale'], fallback: {}, enabled: ['en'] },
    { default: 'en', supported: ['en', 'fr'], fallback: { en: ['fr', 'fr'] }, enabled: ['en'] },
    {
      default: 'en',
      supported: ['en', ...Array.from({ length: 20 }, (_value, index) => `x-${index}`)],
      fallback: {},
      enabled: ['en'],
    },
  ]) {
    kit.setLanguages(languages);
    await expect(
      kit.content.api.getCollection(kit.owner(), { collection: 'articles' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  }
  kit.setLanguages({ default: 'fr', supported: ['en', 'fr'], fallback: {}, enabled: ['fr'] });
  expect(
    (await kit.content.api.getCollection(kit.owner(), { collection: 'articles' })).defaultLocale,
  ).toBe('fr');
});

it.each([
  { publicationLocalesField: 'missing' },
  { publicationLocalesField: 'title' },
  { publicationLocalesField: 'contentLocales', localizeStatus: true },
  { publicationLocalesField: 'contentLocales', mode: 'direct' as const },
])('rejects invalid selected-language publication configurations %j', (patch) => {
  const definitions = workflowCollections();
  const [first] = definitions;
  if (!first) throw new Error('Missing articles');
  Object.assign(first, patch);
  first.fields = [...first.fields, { id: 'content_locales', name: 'contentLocales', type: 'json' }];
  expect(() => createRegistry({ collections: definitions, limits: contentLimits() })).toThrow(
    'invalid input',
  );
});
