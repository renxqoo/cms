import { expect, it } from 'vitest';
import { createRegistry, compileContent } from '../../generate.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import {
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition, FieldDefinition } from '../../definition.ts';

function register(change: (collection: CollectionDefinition) => void) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.hierarchy = true;
  article.admin = { useAsTitle: 'title' };
  change(article);
  return createRegistry({ collections, limits: contentLimits() });
}

it.each([{ hasMany: true }, { localized: true }, { required: true }, { relationTo: ['pages'] }])(
  'rejects a hierarchy parent whose existing field violates its single self relation contract: %j',
  (invalid) => {
    expect(() =>
      register((collection) => {
        collection.fields = [
          ...collection.fields,
          {
            id: 'parent',
            name: 'parent',
            type: 'relationship',
            relationTo: ['articles'],
            ...invalid,
          },
        ];
      }),
    ).toThrow('invalid input');
  },
);

it('normalizes custom parent and virtual names without storing a second path representation', () => {
  const registry = register((collection) => {
    collection.hierarchy = {
      parentFieldName: 'ancestor',
      slugPathFieldName: 'urlPath',
      titlePathFieldName: 'displayPath',
      joinField: { name: 'descendants' },
      admin: { treeLimit: 3, useHeaderButton: false, injectSidebarTab: false },
    };
  });
  const collection = registry.get('articles');
  expect(collection.fields.find((field) => field.name === 'ancestor')).toMatchObject({
    relationTo: ['articles'],
    onDelete: 'restrict',
  });
  expect(collection.fields.find((field) => field.name === 'urlPath')).toMatchObject({
    virtual: true,
  });
  expect(
    compileContent(registry)
      .get('articles')
      .flat.some((field) => ['urlPath', 'displayPath', 'descendants'].includes(field.path)),
  ).toBe(false);
});

it.each([
  (collection: CollectionDefinition) => {
    collection.tags = true;
  },
  (collection: CollectionDefinition) => {
    collection.hierarchy = { parentFieldName: 'same', slugPathFieldName: 'same' };
  },
  (collection: CollectionDefinition) => {
    collection.hierarchy = { slugField: 'score' };
  },
  (collection: CollectionDefinition) => {
    collection.hierarchy = { admin: { treeLimit: 101 } };
  },
  (collection: CollectionDefinition) => {
    collection.singleton = true;
  },
  (collection: CollectionDefinition) => {
    collection.fields = [...collection.fields, { id: 'path', name: 'slugPath', type: 'text' }];
  },
])('rejects incompatible hierarchy configuration %#', (change) => {
  expect(() => register(change)).toThrow('invalid input');
});

it('refuses external multi relations when a hierarchy is configured for one classification per document', () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.hierarchy = { allowHasMany: false };
  const page = contentCollection(collections, 'pages');
  page.fields = [
    ...page.fields,
    { id: 'tags', name: 'tags', type: 'relationship', relationTo: ['articles'], hasMany: true },
  ];
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrow('invalid input');
});

it('finds nested tag source fields and requires a matching collection selection schema', () => {
  const collections = workflowCollections();
  const tags = contentCollection(collections, 'articles');
  tags.tags = { collectionSpecific: { fieldName: 'appliesTo' } };
  const page = contentCollection(collections, 'pages');
  page.fields = [
    { id: 'title', name: 'title', type: 'text' },
    {
      id: 'details',
      name: 'details',
      type: 'group',
      fields: [
        { id: 'tag', name: 'tag', type: 'relationship', relationTo: ['articles'], hasMany: true },
      ],
    },
  ];
  const registry = createRegistry({ collections, limits: contentLimits() });
  expect(registry.get('articles').fields.find((field) => field.name === 'appliesTo')).toMatchObject(
    { type: 'select', hasMany: true, options: ['pages'] },
  );
  tags.fields = [
    ...tags.fields,
    { id: 'scope', name: 'appliesTo', type: 'number' } satisfies FieldDefinition,
  ];
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrow('invalid input');
});
