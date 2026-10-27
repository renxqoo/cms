import { expect, it } from 'vitest';
import { createRegistry, generateArtifacts } from '../../generate.ts';
import { contentOperations } from '../../operations.ts';
import {
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import { dataFingerprint } from '../../collections/data-fingerprint.ts';
import type { JoinDefinition } from '../definition.ts';

function configured(join: JoinDefinition) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [...article.fields, { id: 'joined', name: 'joined', type: 'join', join }];
  return collections;
}
function registry(join: JoinDefinition) {
  return createRegistry({
    collections: configured(join),
    limits: contentLimits(),
    operations: contentOperations,
  });
}

it('keeps the original Join data fingerprint across read-only configuration while generating one paged read contract', () => {
  const original = { collection: 'pages', field: 'author' };
  const changed = {
    ...original,
    where: { field: 'title', operator: 'eq' as const, value: 'Allowed' },
    defaultPageSize: 1,
    defaultSort: [{ field: 'title', order: 'desc' as const }],
    orderable: true,
  };
  const first = contentCollection(configured(original), 'articles');
  const next = contentCollection(configured(changed), 'articles');
  expect(dataFingerprint(next)).toBe(dataFingerprint(first));
  const artifacts = generateArtifacts(registry(changed));
  expect(artifacts.types).toContain(
    'JoinPage<{collection:"pages";id:string} | ExpandedDocument<"pages">>',
  );
  const schema = artifacts.schemas['articles'];
  expect(schema).toHaveProperty('properties.joined.anyOf.0.type', 'object');
  expect(schema).toHaveProperty('properties.joined.anyOf.0.required', [
    'rows',
    'page',
    'pageSize',
    'hasNextPage',
    'sort',
  ]);
  expect(schema).toHaveProperty('properties.joined.anyOf.0.properties.rows.type', 'array');
  expect(schema).toHaveProperty('properties.joined.anyOf.0.properties.total', {
    type: 'integer',
    minimum: 0,
  });
});

it.each([
  { collection: [], field: 'author' },
  { collection: ['pages', 'pages'], field: 'author' },
  { collection: ['pages', 'settings'], field: 'author', orderable: true },
  { collection: 'missing', field: 'author' },
  { collection: 'pages', field: 'title' },
  { collection: 'pages', field: 'missing' },
  { collection: 'pages', field: 'author', defaultPageSize: 0 },
  { collection: 'pages', field: 'author', defaultPageSize: 101 },
  { collection: 'pages', field: 'author', defaultSort: [{ field: 'unknown', order: 'asc' }] },
  { collection: 'pages', field: 'author', defaultSort: [{ field: '_order', order: 'asc' }] },
  {
    collection: 'pages',
    field: 'author',
    defaultSort: [
      { field: 'title', order: 'asc' },
      { field: 'title', order: 'desc' },
    ],
  },
] satisfies JoinDefinition[])(
  'rejects invalid Join membership, sorting and page configuration %j',
  (join) => {
    expect(() => registry(join)).toThrowError(expect.objectContaining({ code: 'invalid_input' }));
  },
);

it('validates inverse collection membership and repeated sort fields while allowing metadata defaults', () => {
  const collections = configured({ collection: 'pages', field: 'author' });
  const pages = contentCollection(collections, 'pages');
  const author = pages.fields.find((field) => field.name === 'author');
  if (!author) throw new Error('Missing author');
  author.relationTo = ['settings'];
  expect(() => createRegistry({ collections, limits: contentLimits() })).toThrowError(
    expect.objectContaining({ code: 'invalid_input' }),
  );
  expect(() =>
    registry({
      collection: 'pages',
      field: 'author',
      defaultSort: [
        { field: 'id', order: 'asc' },
        { field: 'createdAt', order: 'desc' },
      ],
    }),
  ).not.toThrow();
});
