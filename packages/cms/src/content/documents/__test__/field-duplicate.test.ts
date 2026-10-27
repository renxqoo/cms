import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { createRegistry, compileContent } from '../../generate.ts';
import { createContent } from '../../composition.ts';
import { contentOperations } from '../../operations.ts';
import { assetsOperations } from '@new-cms/cms/assets';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
function definitions() {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    { id: 'token', name: 'token', type: 'text', disableDuplicate: true, defaultValue: 'new-token' },
    {
      id: 'private_admin',
      name: 'privateAdmin',
      type: 'text',
      admin: {
        hidden: true,
        readOnly: true,
        description: { en: 'Help', zh: '说明' },
        placeholder: { en: 'Placeholder', zh: '占位' },
        position: 'sidebar',
        width: '50%',
      },
    },
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [
        {
          id: 'group_secret',
          name: 'secret',
          type: 'text',
          disableDuplicate: true,
          defaultValue: 'new-secret',
        },
        { id: 'group_kept', name: 'kept', type: 'text' },
      ],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'row_title', name: 'title', type: 'text', localized: true },
        {
          id: 'row_secret',
          name: 'secret',
          type: 'text',
          disableDuplicate: true,
          defaultValue: 'row-default',
        },
      ],
    },
    {
      id: 'localized_rows',
      name: 'localRows',
      type: 'array',
      localized: true,
      fields: [{ id: 'local_row_value', name: 'value', type: 'text' }],
    },
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'card',
          key: 'card',
          label: 'Card',
          fields: [
            { id: 'card_secret', name: 'secret', type: 'text', disableDuplicate: true },
            { id: 'card_title', name: 'title', type: 'text' },
          ],
        },
      ],
    },
  ];
  return collections;
}
async function fixture() {
  const kit = await createContentFixture({ collections: definitions() });
  fixtures.push(kit);
  return kit;
}
it('describes static admin controls without changing API read and write permissions', async () => {
  const kit = await fixture();
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', privateAdmin: 'API visible' },
  });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    intent: 'update',
    locale: 'zh',
  });
  expect(editor.layout.find((node) => node.name === 'privateAdmin')).toMatchObject({
    hidden: true,
    readOnly: true,
    write: 'allowed',
    description: '说明',
    placeholder: '占位',
    position: 'sidebar',
    width: '50%',
  });
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    revision: doc.revision,
    data: { privateAdmin: 'API writable' },
  });
  expect(updated.data['privateAdmin']).toBe('API writable');
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: doc.id })).data[
      'privateAdmin'
    ],
  ).toBe('API writable');
});
it('clears inherited duplicate fields, applies create defaults, retains explicit values and regenerates shared and localized row identities', async () => {
  const kit = await fixture();
  const shared = '10000000-0000-4000-8000-000000000001',
    local = '10000000-0000-4000-8000-000000000002',
    block = '10000000-0000-4000-8000-000000000003';
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: {
        title: 'English',
        token: 'old-token',
        group: { secret: 'old-secret', kept: 'keep' },
        rows: [{ id: shared, title: 'EN', secret: 'old-row' }],
        localRows: [{ id: local, value: 'English row' }],
        blocks: [{ id: block, blockType: 'card', secret: 'old-block', title: 'Card' }],
      },
      zh: {
        title: '中文',
        rows: [{ id: shared, title: '中文行', secret: 'old-row' }],
        localRows: [{ id: local, value: '中文行' }],
      },
    },
  });
  const copied = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
  });
  expect(copied.data).toMatchObject({
    token: 'new-token',
    group: { secret: 'new-secret', kept: 'keep' },
    rows: [{ title: 'EN', secret: 'row-default' }],
    blocks: [{ blockType: 'card', title: 'Card' }],
  });
  expect(copied.data).not.toHaveProperty('blocks.0.secret');
  const rows = z.array(z.object({ id: z.uuid() })).parse(copied.data['rows']);
  const localRows = z.array(z.object({ id: z.uuid() })).parse(copied.data['localRows']);
  const blocks = z.array(z.object({ id: z.uuid() })).parse(copied.data['blocks']);
  expect(rows[0]?.id).not.toBe(shared);
  expect(localRows[0]?.id).not.toBe(local);
  expect(blocks[0]?.id).not.toBe(block);
  const chinese = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: copied.id,
    locale: 'zh',
    fallback: [],
  });
  expect(chinese.data['rows']).toMatchObject([
    { id: rows[0]?.id, title: '中文行', secret: 'row-default' },
  ]);
  expect(z.array(z.object({ id: z.uuid() })).parse(chinese.data['localRows'])[0]?.id).not.toBe(
    localRows[0]?.id,
  );
  const explicit = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    data: { token: 'manual-token', group: { secret: 'manual-secret' } },
  });
  expect(explicit.data).toMatchObject({
    token: 'manual-token',
    group: { secret: 'manual-secret', kept: 'keep' },
  });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: source.id }))
      .data,
  ).toMatchObject({ token: 'old-token', rows: [{ id: shared }] });
});
it('uses the current field duplication settings when an accepted batch executes in its worker', async () => {
  const collections = definitions();
  const article = contentCollection(collections, 'articles');
  article.fields = article.fields.map((field) =>
    field.name === 'token' ? { ...field, disableDuplicate: false } : field,
  );
  const kit = await createContentFixture({ collections, maxSyncBatchItems: 1 });
  fixtures.push(kit);
  const docs = [];
  for (const title of ['First', 'Second'])
    docs.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title, token: 'old-token' },
      }),
    );
  const accepted = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'copy',
    items: docs.map((doc) => ({ id: doc.id, revision: doc.revision })),
  });
  if (!('jobId' in accepted)) throw new Error('Expected queued batch');
  const registry = createRegistry({
    collections: definitions(),
    limits: kit.limits,
    operations: [...contentOperations, ...assetsOperations],
  });
  const processor = createContent({
    ...kit.contentOptions,
    registry,
    mapping: compileContent(registry),
  });
  try {
    await processor.maintenance();
    const job = await processor.api.getJob(kit.owner(), {
      collection: 'articles',
      jobId: accepted.jobId,
    });
    const result = z
      .object({
        status: z.literal('succeeded'),
        items: z.array(z.object({ resultId: z.uuid() })),
      })
      .parse(job);
    for (const item of result.items)
      expect(
        (
          await processor.api.getDocument(kit.owner(), {
            collection: 'articles',
            id: item.resultId,
          })
        ).data['token'],
      ).toBe('new-token');
  } finally {
    await processor.close();
  }
});
