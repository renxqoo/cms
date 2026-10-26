import { expect, it } from 'vitest';
import { parseContentQuery, contentApiQuery, changeContentQuery } from '../content-query';
import { snapshot, id } from './support';
const { collection } = snapshot();
function query(values: Readonly<Record<string, unknown>>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    search.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  return search;
}
it('maps only allowed query fields into a locale-explicit non-fallback document request', () => {
  const parsed = parseContentQuery(
    query({
      page: '3',
      pageSize: '50',
      q: 'Archive',
      locale: 'zh-CN',
      mode: 'published',
      trashed: 'true',
      folderId: 'null',
      where: {
        and: [
          { field: 'title', operator: 'contains', value: 'news' },
          { field: 'revision', operator: 'gt', value: 0 },
        ],
      },
      sort: [{ field: 'title', order: 'desc' }],
      columns: ['id', 'title', 'secret'],
      bearer: 'private',
    }),
    collection,
  );
  expect(parsed.invalid).toBe(false);
  expect(parsed.columns).toEqual(['id', 'title']);
  expect(contentApiQuery(parsed)).toEqual({
    page: 3,
    pageSize: 50,
    q: 'Archive',
    locale: 'zh-CN',
    fallback: [],
    depth: 0,
    mode: 'published',
    trashed: true,
    folderId: null,
    where: {
      and: [
        { field: 'title', operator: 'contains', value: 'news' },
        { field: 'revision', operator: 'gt', value: 0 },
      ],
    },
    sort: [{ field: 'title', order: 'desc' }],
  });
});
it('resets pagination after query changes and removes unknown URL keys while preserving the selected locale and columns', () => {
  const href = changeContentQuery(
    collection,
    query({
      page: '7',
      q: 'old',
      locale: 'zh-CN',
      columns: ['id', 'title'],
      unexpected: 'discard',
    }),
    { q: 'new' },
  );
  const search = new URL(href, 'https://admin.example.test').searchParams;
  expect(parseContentQuery(search, collection)).toMatchObject({
    page: 1,
    q: 'new',
    locale: 'zh-CN',
    columns: ['id', 'title'],
  });
  expect(search.has('unexpected')).toBe(false);
  expect(href.startsWith('/dashboard/collections/articles?')).toBe(true);
});
it('changes an explicit page without discarding a pending search and sort', () => {
  const href = changeContentQuery(
    collection,
    query({ page: '2', q: 'term', sort: [{ field: 'updatedAt', order: 'asc' }] }),
    { page: 4 },
  );
  expect(
    parseContentQuery(new URL(href, 'https://admin.example.test').searchParams, collection),
  ).toMatchObject({ page: 4, q: 'term', sort: [{ field: 'updatedAt', order: 'asc' }] });
});
it.each([
  { sort: [{ field: 'secret', order: 'asc' }] },
  { where: { field: 'hidden', operator: 'eq', value: 'x' } },
  { where: { field: 'title', operator: 'sql', value: 'x' } },
  { where: { field: 'title', operator: 'in', value: [] } },
  { where: { field: 'id', operator: 'exists', value: 'true' } },
  { folderId: 'invalid' },
  { locale: 'missing' },
  { q: 'x'.repeat(257) },
  { where: 'not json' },
  { sort: 'not json' },
])('rejects an unsupported or malformed query %j', (values) => {
  expect(parseContentQuery(query(values), collection).invalid).toBe(true);
});
it('accepts metadata predicates and UUID folder filters while normalizing invalid pagination', () => {
  const parsed = parseContentQuery(
    query({
      page: '-3',
      pageSize: '101',
      folderId: id,
      where: {
        or: [
          { field: 'folderId', operator: 'exists', value: false },
          { field: 'id', operator: 'in', value: [id] },
        ],
      },
    }),
    collection,
  );
  expect(parsed).toMatchObject({ page: 1, pageSize: 20, folderId: id, invalid: false });
});
it('limits predicate node count and depth before enabling a request', () => {
  const leaf = { field: 'title', operator: 'eq', value: 'x' };
  expect(
    parseContentQuery(query({ where: { and: Array.from({ length: 51 }, () => leaf) } }), collection)
      .invalid,
  ).toBe(true);
  let deep: unknown = leaf;
  for (let index = 0; index < 10; index += 1) deep = { and: [deep] };
  expect(parseContentQuery(query({ where: deep }), collection).invalid).toBe(true);
});
it('rejects excessively nested URL predicates before building their recursive query schema', () => {
  const leaf = '{"field":"title","operator":"eq","value":"x"}';
  const text = '{"and":['.repeat(2000) + leaf + ']}'.repeat(2000);
  let invalid = false;
  expect(() => {
    ({ invalid } = parseContentQuery(query({ where: text }), collection));
  }).not.toThrow();
  expect(invalid).toBe(true);
});
