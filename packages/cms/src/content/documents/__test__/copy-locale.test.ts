import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition } from '../../definition.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(change?: (collection: CollectionDefinition) => void) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.localizeStatus = true;
  article.fields = [
    ...article.fields,
    { id: 'summary', name: 'summary', type: 'text', localized: true },
    { id: 'count', name: 'count', type: 'number', localized: true },
    { id: 'enabled', name: 'enabled', type: 'boolean', localized: true },
    { id: 'blank', name: 'blank', type: 'text', localized: true },
    {
      id: 'details',
      name: 'details',
      type: 'group',
      fields: [
        { id: 'detail_label', name: 'label', type: 'text', localized: true },
        { id: 'detail_key', name: 'key', type: 'text' },
      ],
    },
    {
      id: 'cards',
      name: 'cards',
      type: 'array',
      localized: true,
      fields: [{ id: 'card_label', name: 'label', type: 'text' }],
    },
    {
      id: 'sections',
      name: 'sections',
      type: 'array',
      fields: [
        { id: 'section_key', name: 'key', type: 'text' },
        { id: 'section_label', name: 'label', type: 'text', localized: true },
      ],
    },
  ];
  change?.(article);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}
const sourceRow = '10000000-0000-4000-8000-000000000001';
const targetRow = '10000000-0000-4000-8000-000000000002';
const sharedRow = '10000000-0000-4000-8000-000000000003';
it('fills only missing translated values without fallback, preserves populated primitives and shared fields, and replays one revision', async () => {
  const kit = await fixture();
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: {
        title: 'English',
        summary: 'Source summary',
        slug: 'stable',
        count: 5,
        enabled: true,
        blank: 'Source blank',
        details: { key: 'shared', label: 'Source label' },
        cards: [{ id: sourceRow, label: 'Card' }],
        sections: [{ id: sharedRow, key: 'stable', label: 'Source section' }],
      },
      zh: {
        title: 'Existing Chinese',
        count: 0,
        enabled: false,
        blank: '',
        details: { label: null },
        cards: [{ id: targetRow, label: null }],
      },
    },
  });
  const ctx = kit.owner();
  const input = {
    collection: 'articles',
    id: doc.id,
    revision: doc.revision,
    fromLocale: 'en',
    toLocale: 'zh',
  };
  const copied = await kit.content.api.copyLocale(ctx, input);
  expect(copied.data).toMatchObject({
    title: 'Existing Chinese',
    summary: 'Source summary',
    slug: 'stable',
    count: 0,
    enabled: false,
    blank: '',
    details: { key: 'shared', label: 'Source label' },
    cards: [{ id: targetRow, label: 'Card' }],
    sections: [{ id: sharedRow, key: 'stable', label: 'Source section' }],
  });
  const exact = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    locale: 'zh',
    fallback: [],
  });
  expect(exact.data['summary']).toBe('Source summary');
  expect((await kit.content.api.copyLocale(ctx, input)).versionId).toBe(copied.versionId);
  expect(
    (await kit.content.api.listVersions(kit.owner(), { collection: 'articles', id: doc.id })).total,
  ).toBe(2);
  const original = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    locale: 'en',
    fallback: [],
  });
  expect(original.data['cards']).toEqual([{ id: sourceRow, label: 'Card' }]);
});
it('overwrites translations, regenerates localized rows and preserves an already published target snapshot', async () => {
  const kit = await fixture((article) => {
    article.disableDuplicate = true;
  });
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'Source', cards: [{ id: sourceRow, label: 'Source card' }] },
      zh: { title: 'Published target', cards: [{ id: targetRow, label: 'Target card' }] },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    revision: doc.revision,
    locale: 'zh',
  });
  const result = await kit.content.api.copyLocale(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    revision: published.revision,
    fromLocale: 'en',
    toLocale: 'zh',
    overwrite: true,
  });
  expect(result.data['title']).toBe('Source');
  const cards = z.array(z.object({ id: z.uuid(), label: z.string() })).parse(result.data['cards']);
  expect(cards[0]?.label).toBe('Source card');
  expect(cards[0]?.id).not.toBe(sourceRow);
  expect(cards[0]?.id).not.toBe(targetRow);
  expect(result.publishedVersionId).toBe(published.versionId);
  const live = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    locale: 'zh',
    mode: 'published',
  });
  expect(live.data['title']).toBe('Published target');
});
it('rechecks source and destination locale access, redacts unreadable source fields and enforces destination field writes', async () => {
  let sourceAllowed = true;
  let targetAllowed = true;
  let fieldAllowed = true;
  const kit = await fixture((article) => {
    article.access = {
      'documents.get': {
        version: 'source-locale',
        run: ({ locale }) => locale !== 'en' || sourceAllowed,
      },
      'documents.update': {
        version: 'target-locale',
        run: ({ locale }) => locale !== 'zh' || targetAllowed,
      },
    };
    article.fields = [
      ...article.fields,
      {
        id: 'private',
        name: 'private',
        type: 'text',
        localized: true,
        access: { read: { version: 'source-private', run: ({ locale }) => locale !== 'en' } },
      },
      {
        id: 'protected',
        name: 'protected',
        type: 'text',
        localized: true,
        access: {
          write: {
            version: 'target-private',
            run: ({ locale }) => locale !== 'zh' || fieldAllowed,
          },
        },
      },
    ];
  });
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'Source', private: 'Unreadable source', protected: 'Source protected' },
      zh: { title: 'Target', private: 'Target preserved', protected: 'Target protected' },
    },
  });
  const input = {
    collection: 'articles',
    id: doc.id,
    revision: doc.revision,
    fromLocale: 'en',
    toLocale: 'zh',
    overwrite: true,
  };
  sourceAllowed = false;
  await expect(kit.content.api.copyLocale(kit.owner(), input)).rejects.toMatchObject({
    code: 'forbidden',
  });
  sourceAllowed = true;
  targetAllowed = false;
  await expect(kit.content.api.copyLocale(kit.owner(), input)).rejects.toMatchObject({
    code: 'forbidden',
  });
  targetAllowed = true;
  fieldAllowed = false;
  await expect(kit.content.api.copyLocale(kit.owner(), input)).rejects.toMatchObject({
    code: 'forbidden',
  });
  fieldAllowed = true;
  const result = await kit.content.api.copyLocale(kit.owner(), input);
  expect(result.revision).toBe(2);
  expect(result.data['private']).toBe('Target preserved');
  expect(result.data['protected']).toBe('Source protected');
});
it('applies role revocation immediately, rejects invalid locales and stale revisions, and releases cancelled work', async () => {
  const kit = await fixture();
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'English' },
  });
  const editor = await contentActor(kit, [
    'articles:documents.copyLocale',
    'articles:documents.get',
    'articles:documents.update',
  ]);
  const input = {
    collection: 'articles',
    id: doc.id,
    revision: doc.revision,
    fromLocale: 'en',
    toLocale: 'zh',
  };
  for (const patch of [
    { fromLocale: 'all' },
    { toLocale: 'all' },
    { toLocale: 'de' },
    { toLocale: 'en' },
    { revision: 2 },
  ])
    await expect(
      kit.content.api.copyLocale(editor.ctx(), { ...input, ...patch }),
    ).rejects.toMatchObject({ code: patch.revision ? 'version_conflict' : 'invalid_input' });
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    kit.content.api.copyLocale({ ...editor.ctx(), signal: aborted.signal }, input),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  const copied = await kit.content.api.copyLocale(editor.ctx(), input);
  expect(copied.revision).toBe(2);
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: editor.role.id,
    version: editor.role.version,
    permissionIds: [
      kit.permissionIds.get('articles:documents.copyLocale'),
      kit.permissionIds.get('articles:documents.get'),
    ],
  });
  await expect(
    kit.content.api.copyLocale(editor.ctx(), { ...input, revision: copied.revision }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('requires the owning editor session when copying into a different translation of a leased document', async () => {
  const kit = await fixture((collection) => {
    collection.lockDocuments = { durationMs: 300000, heartbeatMs: 30000 };
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source' },
  });
  const editorId = randomUUID();
  await kit.content.api.acquireEditorLease(kit.owner(), {
    collection: 'articles',
    id: source.id,
    editorId,
    locale: 'en',
  });
  const input = {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    fromLocale: 'en',
    toLocale: 'zh',
  };
  await expect(kit.content.api.copyLocale(kit.owner(), input)).rejects.toMatchObject({
    code: 'document_locked',
  });
  const copied = await kit.content.api.copyLocale(
    { ...kit.owner(), editorSessionId: editorId },
    input,
  );
  expect(copied.data['title']).toBe('Source');
});

it('copies localized blocks and nested rows with fresh structure IDs while preserving arbitrary JSON IDs', async () => {
  const kit = await fixture((collection) => {
    collection.fields = [
      ...collection.fields,
      {
        id: 'panel',
        name: 'panel',
        type: 'group',
        localized: true,
        fields: [
          {
            id: 'panel_rows',
            name: 'items',
            type: 'array',
            fields: [{ id: 'panel_text', name: 'text', type: 'text' }],
          },
        ],
      },
      {
        id: 'layout',
        name: 'layout',
        type: 'blocks',
        localized: true,
        blocks: [
          {
            id: 'quote_block',
            key: 'quote',
            label: 'Quote',
            fields: [{ id: 'quote_text', name: 'text', type: 'text' }],
          },
        ],
      },
      { id: 'payload', name: 'payload', type: 'json', localized: true },
    ];
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: {
        title: 'Source',
        panel: { items: [{ id: sourceRow, text: 'Nested' }] },
        layout: [{ id: sharedRow, blockType: 'quote', text: 'Quote' }],
        payload: { id: 'external-json-id' },
      },
      zh: { title: 'Target', layout: [], payload: null },
    },
  });
  const copied = await kit.content.api.copyLocale(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    fromLocale: 'en',
    toLocale: 'zh',
  });
  const panel = z
    .object({ items: z.array(z.object({ id: z.uuid(), text: z.string() })) })
    .parse(copied.data['panel']);
  const layout = z
    .array(z.object({ id: z.uuid(), blockType: z.string(), text: z.string() }))
    .parse(copied.data['layout']);
  expect(panel.items[0]?.id).not.toBe(sourceRow);
  expect(panel.items[0]?.text).toBe('Nested');
  expect(layout[0]?.id).not.toBe(sharedRow);
  expect(layout[0]).toMatchObject({ blockType: 'quote', text: 'Quote' });
  expect(copied.data['payload']).toEqual({ id: 'external-json-id' });
});

it('offers conditional locale copying from a readable source when only the destination language is writable', async () => {
  const kit = await fixture((collection) => {
    collection.access = {
      'documents.update': { version: 'destination-only', run: ({ locale }) => locale === 'zh' },
    };
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Readonly source' },
  });
  const descriptor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: source.id,
    locale: 'en',
    intent: 'read',
  });
  expect(
    descriptor.actions.find((action) => action.operationId === 'documents.copyLocale')?.state,
  ).toBe('conditional');
  const copied = await kit.content.api.copyLocale(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    fromLocale: 'en',
    toLocale: 'zh',
  });
  expect(copied.data['title']).toBe('Readonly source');
});
