import { expect, it } from 'vitest';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { workflowCollections } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { createContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { collectionEditorSchema } from '../contracts.ts';
import { article, fixture, node, retain } from './support.ts';

it('retains safe editing layout, named tabs, repeated block branches and read-only joins', async () => {
  const collections = workflowCollections();
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'row',
      type: 'row',
      fields: [{ id: 'code', name: 'code', type: 'code', maxLength: 100 }],
    },
    {
      id: 'fold',
      type: 'collapsible',
      label: 'Details',
      fields: [{ id: 'enabled', name: 'enabled', type: 'boolean' }],
    },
    {
      id: 'tabs',
      type: 'tabs',
      tabs: [
        {
          id: 'named_tab',
          name: 'seo',
          label: 'Search',
          fields: [{ id: 'keywords', name: 'keywords', type: 'textarea', localized: true }],
        },
        {
          id: 'plain_tab',
          label: 'More',
          fields: [{ id: 'rank', name: 'rank', type: 'number', min: 0, max: 100, precision: 2 }],
        },
      ],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [{ id: 'row_title', name: 'title', type: 'text' }],
    },
    {
      id: 'content',
      name: 'content',
      type: 'blocks',
      blocks: [
        {
          id: 'hero_block',
          key: 'hero',
          label: 'Hero',
          fields: [{ id: 'hero_title', name: 'title', type: 'text', required: true }],
        },
        {
          id: 'quote_block',
          key: 'quote',
          label: 'Quote',
          fields: [{ id: 'quote_title', name: 'title', type: 'textarea' }],
        },
      ],
    },
    {
      id: 'pages_join',
      name: 'pages',
      type: 'join',
      join: { collection: 'pages', field: 'author' },
    },
  ];
  const kit = await fixture(collections);
  const result = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(node(result.layout, 'row').children?.map((field) => field.name)).toEqual(['code']);
  expect(node(result.layout, 'fold').label).toBe('Details');
  expect(node(result.layout, 'keywords').path).toBe('seo.keywords');
  expect(node(result.layout, 'rank').constraints).toEqual({ min: 0, max: 100, precision: 2 });
  expect(node(result.layout, 'rows').children?.map((field) => field.id)).toEqual(['row_title']);
  expect(
    node(result.layout, 'content').blocks?.map((block) => [block.key, block.children[0]?.id]),
  ).toEqual([
    ['hero', 'hero_title'],
    ['quote', 'quote_title'],
  ]);
  expect(node(result.layout, 'pages_join').write).toBe('denied');
  expect(result.schemas.draft['properties']).not.toHaveProperty('pages');
  expect(result.schemas.commit['required']).toContain('title');
  expect(result.schemas.draft['required']).toEqual([]);
  expect(JSON.stringify(result.schemas.draft)).not.toContain('versionId');
  expect(JSON.stringify(result.schemas.read)).toContain('versionId');
  expect(collectionEditorSchema.safeParse(result).success).toBe(true);
  expect(() => z.toJSONSchema(collectionEditorSchema)).not.toThrow();
});

it('does not expose hidden children through group, array or block default objects', async () => {
  const collections = workflowCollections();
  const hidden = {
    version: '1',
    run: ({ actor }: { actor: { role: { isSuper: boolean } } }) => actor.role.isSuper,
  };
  const id = randomUUID();
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'hidden_group',
      name: 'hiddenGroup',
      type: 'group',
      access: { read: hidden },
      fields: [
        {
          id: 'hidden_child',
          name: 'hiddenChild',
          type: 'text',
          label: 'Classified child',
          defaultValue: 'CLASSIFIED',
        },
      ],
    },
    {
      id: 'public_group',
      name: 'info',
      type: 'group',
      defaultValue: { public: 'visible', secret: 'CLASSIFIED' },
      fields: [
        { id: 'public_text', name: 'public', type: 'text', minLength: 1, maxLength: 20 },
        {
          id: 'secret_text',
          name: 'secret',
          type: 'text',
          label: 'Classified',
          access: { read: hidden },
        },
      ],
    },
    {
      id: 'array_defaults',
      name: 'rows',
      type: 'array',
      defaultValue: [{ id, public: 'visible', secret: 'CLASSIFIED' }],
      fields: [
        { id: 'array_public', name: 'public', type: 'text' },
        { id: 'array_secret', name: 'secret', type: 'text', access: { read: hidden } },
      ],
    },
    {
      id: 'block_defaults',
      name: 'blocks',
      type: 'blocks',
      defaultValue: [{ id, blockType: 'one', public: 'visible', secret: 'CLASSIFIED' }],
      blocks: [
        {
          id: 'one_block',
          key: 'one',
          label: 'One',
          fields: [
            { id: 'block_public', name: 'public', type: 'text' },
            { id: 'block_secret', name: 'secret', type: 'text', access: { read: hidden } },
          ],
        },
      ],
    },
    {
      id: 'empty_row',
      type: 'row',
      fields: [{ id: 'row_secret', name: 'rowSecret', type: 'text', access: { read: hidden } }],
    },
  ];
  const kit = await fixture(collections);
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.create',
  ]);
  const result = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    intent: 'create',
  });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain('CLASSIFIED');
  expect(serialized).not.toContain('secret');
  expect(serialized).not.toContain('hidden');
  expect(serialized).not.toContain('empty_row');
  expect(node(result.layout, 'public_group').constraints.defaultValue).toEqual({
    public: 'visible',
  });
  expect(node(result.layout, 'array_defaults').constraints.defaultValue).toEqual([
    { id, public: 'visible' },
  ]);
  expect(node(result.layout, 'block_defaults').constraints.defaultValue).toEqual([
    { id, blockType: 'one', public: 'visible' },
  ]);
});

it('shows readable fields that cannot be queried and keeps candidate write policies conditional', async () => {
  const collections = workflowCollections();
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'readable',
      name: 'readable',
      type: 'select',
      options: ['a', 'b'],
      access: {
        read: { version: '1', run: ({ operation }) => operation === 'documents.get' },
        query: { version: '1', run: () => false },
      },
    },
    {
      id: 'guarded',
      name: 'guarded',
      type: 'text',
      access: {
        write: {
          version: '1',
          run: ({ nextData }) => {
            if (!nextData) throw new Error('Candidate values are required');
            return nextData['guarded'] === 'allowed';
          },
        },
      },
    },
  ];
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A', readable: 'a' },
  });
  const result = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'update',
    id: document.id,
  });
  expect(node(result.layout, 'readable')).toMatchObject({
    write: 'allowed',
    queryable: false,
    constraints: { options: ['a', 'b'] },
  });
  expect(node(result.layout, 'guarded').write).toBe('conditional');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      data: { guarded: 'rejected' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      data: { guarded: 'allowed' },
    }),
  ).resolves.toMatchObject({ data: { guarded: 'allowed' } });
});

it('reports configured upload limits and recipe without storage implementation details', async () => {
  const kit = retain(await createContentMediaFixture());
  const result = await kit.content.api.getEditor(kit.owner(), {
    collection: 'media',
    intent: 'create',
  });
  expect(result.upload).toEqual({
    mimeTypes: ['image/png', 'application/pdf'],
    maxBytes: 20971520,
    recipe: {
      variants: [{ name: 'tiny', width: 2, height: 2, fit: 'inside', format: 'webp', quality: 80 }],
    },
    maxOutputBytes: 20971520,
    maxPixels: 40000000,
    maxFrames: 1,
    maxWidth: 8192,
    maxHeight: 8192,
    maxVariants: 10,
    directUpload: false,
    multipart: false,
  });
  expect(JSON.stringify(result)).not.toContain('object_key');
  const corrupted = { ...result, upload: { ...result.upload, maxBytes: '20971520' } };
  expect(collectionEditorSchema.safeParse(corrupted).success).toBe(false);
});

it('retains zero, false, null and JSON defaults without sharing mutable definition state', async () => {
  const collections = workflowCollections();
  article(collections).fields = [
    ...article(collections).fields,
    { id: 'zero', name: 'zero', type: 'number', defaultValue: 0, min: 0, max: 10 },
    { id: 'off', name: 'off', type: 'boolean', defaultValue: false },
    {
      id: 'settings_json',
      name: 'settings',
      type: 'json',
      defaultValue: { theme: 'Own value', nested: ['a'] },
    },
    { id: 'origin', name: 'origin', type: 'point', defaultValue: [0, 0] },
    {
      id: 'choices',
      name: 'choices',
      type: 'select',
      hasMany: true,
      options: ['a', 'b'],
      defaultValue: ['a'],
    },
    {
      id: 'blank_group',
      name: 'blank',
      type: 'group',
      defaultValue: null,
      fields: [{ id: 'blank_value', name: 'value', type: 'text' }],
    },
  ];
  const kit = await fixture(collections);
  const first = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(node(first.layout, 'zero').constraints.defaultValue).toBe(0);
  expect(node(first.layout, 'off').constraints.defaultValue).toBe(false);
  expect(node(first.layout, 'origin').constraints.defaultValue).toEqual([0, 0]);
  expect(node(first.layout, 'choices').constraints).toEqual({
    options: ['a', 'b'],
    hasMany: true,
    defaultValue: ['a'],
  });
  expect(node(first.layout, 'blank_group').constraints.defaultValue).toBeNull();
  node(first.layout, 'settings_json').constraints.defaultValue = 'client mutation';
  const again = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(node(again.layout, 'settings_json').constraints.defaultValue).toEqual({
    theme: 'Own value',
    nested: ['a'],
  });
});

it('exposes only custom rich-text node identities when a rich-text field is readable', async () => {
  const collections = workflowCollections();
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'body',
      name: 'body',
      type: 'richText',
      access: {
        read: {
          version: '1',
          run: ({ actor }) => actor.role.isSuper,
        },
      },
    },
  ];
  article(collections).richTextNodes = [
    {
      type: 'callout',
      version: 'v2',
      validate: { version: 'validator2', run: (value) => typeof value === 'string' },
    },
  ];
  const kit = await fixture(collections);
  const owner = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(owner.richTextNodes).toEqual([{ type: 'callout', version: 'v2' }]);
  expect(JSON.stringify(owner)).not.toContain('validator2');
  const actor = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.create',
  ]);
  const restricted = await kit.content.api.getEditor(actor.ctx(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(restricted.richTextNodes).toEqual([]);
  expect(JSON.stringify(restricted.layout)).not.toContain('body');
});

it('uses actual list query context and all block branches when reporting queryability', async () => {
  const collections = workflowCollections();
  article(collections).fields = [
    ...article(collections).fields,
    {
      id: 'query_in_list',
      name: 'queryable',
      type: 'text',
      access: {
        read: { version: '1', run: () => true },
        query: {
          version: '1',
          run: ({ operation, data }) => operation === 'documents.list' && data === undefined,
        },
      },
    },
    {
      id: 'query_blocks',
      name: 'parts',
      type: 'blocks',
      blocks: [
        {
          id: 'public_branch',
          key: 'visible',
          label: 'Visible',
          fields: [{ id: 'public_branch_title', name: 'title', type: 'text' }],
        },
        {
          id: 'private_branch',
          key: 'private',
          label: 'Private',
          fields: [
            {
              id: 'private_branch_title',
              name: 'title',
              type: 'text',
              access: { read: { version: '1', run: () => false } },
            },
          ],
        },
      ],
    },
  ];
  const kit = await fixture(collections);
  const result = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(node(result.layout, 'query_in_list').queryable).toBe(true);
  expect(node(result.layout, 'public_branch_title').queryable).toBe(false);
  expect(JSON.stringify(result.layout)).not.toContain('private_branch_title');
});
