import { expect, it } from 'vitest';
import { parseCatalogQuery, parsePublicLocale } from '../query.ts';
import { canonicalJson, envelope, sitemapBucket } from '../integrity.ts';

it('accepts exact model IDs, bounded pagination and actual capability filters', () => {
  expect(
    parseCatalogQuery({ page: '2', pageSize: '10', q: '  reasoning  ', callable: 'false' }),
  ).toMatchObject({ page: 2, pageSize: 10, q: 'reasoning', callable: false });
  expect(parseCatalogQuery({ ids: '10000000-0000-4000-8000-000000000001' }).ids).toEqual([
    '10000000-0000-4000-8000-000000000001',
  ]);
});

it.each([
  { oldCategory: 'chat' },
  { page: '0' },
  { page: '1.5' },
  { pageSize: '101' },
  { q: 'x'.repeat(121) },
  { callable: 'yes' },
  { ids: 'model-key' },
  { sort: 'random' },
  { category: 'music' },
])('rejects ambiguous or unbounded public query %j', (query) => {
  expect(() => parseCatalogQuery(query)).toThrow('invalid input');
});

it('requires canonical BCP47 languages and never guesses missing translations', () => {
  expect(parsePublicLocale('en-GB')).toBe('en-GB');
  expect(() => parsePublicLocale('en-gb')).toThrow('invalid input');
  expect(() => parsePublicLocale('en_GB')).toThrow('invalid input');
});

it('hashes final deterministic data independently of object insertion order', () => {
  const first = envelope('en', { nested: { z: 1, a: 2 }, values: ['x', 'y'] });
  const second = envelope('en', { values: ['x', 'y'], nested: { a: 2, z: 1 } });
  expect(first.revision).toBe(second.revision);
  expect(envelope('zh', first.data).revision).not.toBe(first.revision);
  expect(envelope('en', { ...first.data, values: ['y', 'x'] }).revision).not.toBe(first.revision);
  expect(canonicalJson({ b: 2, a: [1, { d: false, c: null }] })).toBe(
    '{"a":[1,{"c":null,"d":false}],"b":2}',
  );
});

it('assigns canonical sitemap paths into the fixed sixteen stable buckets', () => {
  expect(sitemapBucket('/en/models/alpha')).toBe(9);
  expect(sitemapBucket('/zh/models/alpha')).toBe(8);
});
