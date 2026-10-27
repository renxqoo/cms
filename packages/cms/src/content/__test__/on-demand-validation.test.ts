import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
  contentField,
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
    { id: 'category', name: 'category', type: 'text', defaultValue: 'generated' },
  ];
  contentField(articles, 'score').validate = {
    version: 'positive',
    run: (value) => typeof value === 'number' && value > 0,
  };
  articles.access = {
    'documents.create': { version: 'create', run: () => false },
    'documents.update': { version: 'update', run: () => false },
    'documents.validate': { version: 'validate', run: () => true },
  };
  contentField(articles, 'category').access = {
    write: { version: 'denied', run: () => false },
    validate: { version: 'allowed', run: () => true },
  };
  let changed = 0;
  articles.hooks = {
    beforeValidate: [
      {
        version: 'trim',
        run: ({ data }) => ({
          ...data,
          title:
            typeof data?.['title'] === 'string' ? data['title'].trim() : (data?.['title'] ?? null),
        }),
      },
    ],
    afterChange: [
      {
        version: 'observe',
        run: () => {
          changed += 1;
        },
      },
    ],
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return { ...kit, changed: () => changed };
}

it('validates an unsaved candidate with independent access and defaults without writing a document, history, audit or work', async () => {
  const kit = await fixture();
  const before = await kit.database.query<{
    documents: number;
    revisions: number;
    audits: number;
    work: number;
  }>(
    'SELECT (SELECT count(*)::int FROM content_documents) AS documents,(SELECT count(*)::int FROM content_revisions) AS revisions,(SELECT count(*)::int FROM audit_events) AS audits,(SELECT count(*)::int FROM content_jobs) AS work',
  );
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      data: { title: ' Valid ', category: 'custom', score: 1 },
    }),
  ).toEqual({ valid: true, errors: [] });
  const after = await kit.database.query(
    'SELECT (SELECT count(*)::int FROM content_documents) AS documents,(SELECT count(*)::int FROM content_revisions) AS revisions,(SELECT count(*)::int FROM audit_events) AS audits,(SELECT count(*)::int FROM content_jobs) AS work',
  );
  expect(after.rows).toEqual(before.rows);
  expect(kit.changed()).toBe(0);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Denied' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('returns invalid field paths and respects draft versus publication required rules', async () => {
  const kit = await fixture();
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      data: {},
      mode: 'draft',
    }),
  ).toEqual({ valid: true, errors: [] });
  expect(
    await kit.content.api.validateDocument(kit.owner(), { collection: 'articles', data: {} }),
  ).toMatchObject({ valid: false, errors: [{ field: 'title' }] });
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Valid', score: -1 },
    }),
  ).toMatchObject({ valid: false, errors: [{ field: 'score' }] });
});

it('checks current unique reservations and existing document revision without committing candidate values', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const existing = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original', slug: 'reserved' },
  });
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Duplicate', slug: 'reserved' },
    }),
  ).toEqual({ valid: false, errors: [{ field: 'slug', message: 'Value must be unique.' }] });
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      id: existing.id,
      revision: existing.revision,
      data: { title: 'Candidate', slug: 'reserved' },
    }),
  ).toEqual({ valid: true, errors: [] });
  await expect(
    kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      id: existing.id,
      revision: existing.revision + 1,
      data: { title: 'Stale' },
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  expect(
    await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: existing.id }),
  ).toMatchObject({ revision: existing.revision, data: { title: 'Original', slug: 'reserved' } });
});

it('validates each submitted language and rejects empty, oversized or incomplete candidate identities', async () => {
  const kit = await fixture();
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      dataByLocale: { en: { title: 'English' }, zh: { title: '中文' } },
    }),
  ).toEqual({ valid: true, errors: [] });
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      dataByLocale: { en: { title: 'English' }, zh: {} },
    }),
  ).toMatchObject({ valid: false, errors: [{ field: 'title', locale: 'zh' }] });
  for (const candidate of [
    { dataByLocale: {} },
    {
      dataByLocale: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`l${index}`, {}])),
    },
    { id: '11111111-1111-4111-8111-111111111111', data: {} },
    { revision: 1, data: {} },
    { data: {}, dataByLocale: { en: {} } },
  ]) {
    await expect(
      kit.content.api.validateDocument(kit.owner(), { collection: 'articles', ...candidate }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  }
});
