import { expect, it } from 'vitest';
import {
  collectionHref,
  displayField,
  documentQueryHref,
  documentTitle,
  parseDocumentQuery,
  queryFilter,
} from '../query';
import { flattenFolders } from '../folders';
import { catalog, document, documentId, folderId } from './support';

it('normalizes document pagination and rejects unregistered sort or locale values', () => {
  const parsed = parseDocumentQuery(
    new URLSearchParams(
      'page=-5&pageSize=101&sort=hidden&locale=unknown&mode=other&folderId=wrong',
    ),
    catalog(),
  );
  expect(parsed).toMatchObject({
    page: 1,
    pageSize: 20,
    sort: 'updatedAt',
    locale: 'en',
    mode: 'editing',
    folderId: undefined,
  });
  expect(
    parseDocumentQuery(
      new URLSearchParams(
        'page=4&pageSize=50&mode=published&trashed=true&order=asc&locale=zh-CN&folderId=root',
      ),
      catalog(),
    ),
  ).toMatchObject({
    page: 4,
    pageSize: 50,
    mode: 'published',
    trashed: true,
    order: 'asc',
    locale: 'zh-CN',
    folderId: null,
  });
  expect(
    parseDocumentQuery(new URLSearchParams(`folderId=${folderId}&sort=title`), catalog()),
  ).toMatchObject({ folderId, sort: 'title' });
});

it('keeps rapid search and filter patches while resetting pagination', () => {
  const previous = parseDocumentQuery(
    new URLSearchParams('page=8&q=before&mode=published&locale=zh-CN'),
    catalog(),
  );
  const href = documentQueryHref('/dashboard/collections/articles', previous, {
    q: 'New & search',
    folderId: null,
  });
  const params = new URL(href, 'http://localhost').searchParams;
  expect(params.get('q')).toBe('New & search');
  expect(params.get('page')).toBe('1');
  expect(params.get('folderId')).toBe('root');
  expect(params.get('mode')).toBe('published');
  expect(
    new URL(documentQueryHref('/list', previous, { page: 3 }), 'http://localhost').searchParams.get(
      'page',
    ),
  ).toBe('3');
});

it('constructs typed field filters only for queryable safe metadata', () => {
  const query = parseDocumentQuery(new URLSearchParams(), catalog());
  expect(queryFilter(query, catalog())).toEqual({ valid: true, where: undefined });
  expect(
    queryFilter({ ...query, filterField: 'hidden', filterValue: 'secret' }, catalog()).valid,
  ).toBe(false);
  expect(
    queryFilter({ ...query, filterField: 'count', filterValue: '0' }, catalog()).where,
  ).toEqual({ field: 'count', operator: 'eq', value: 0 });
  for (const value of ['', 'Infinity', 'wrong'])
    expect(
      queryFilter({ ...query, filterField: 'count', filterValue: value }, catalog()).valid,
    ).toBe(false);
  expect(
    queryFilter({ ...query, filterField: 'active', filterValue: 'false' }, catalog()).where,
  ).toEqual({ field: 'active', operator: 'eq', value: false });
  expect(queryFilter({ ...query, filterField: 'active', filterValue: '1' }, catalog()).valid).toBe(
    false,
  );
  expect(
    queryFilter({ ...query, filterField: 'title', filterValue: '文字' }, catalog()).where,
  ).toEqual({ field: 'title', operator: 'eq', value: '文字' });
});

it('does not invent a title for unreadable data and renders full structured values safely', () => {
  expect(documentTitle(document(), catalog())).toBe('Server title');
  expect(documentTitle(document({ data: {} }), catalog())).toBe(documentId);
  expect(
    displayField(
      document({ data: { nested: { value: false }, empty: null, rows: [1, 2] } }),
      'nested.value',
    ),
  ).toBe('false');
  expect(displayField(document({ data: { rows: [1, 2] } }), 'rows')).toBe('[1,2]');
  expect(displayField(document(), 'hidden')).toBe('—');
  expect(collectionHref('articles', documentId)).toBe(
    `/dashboard/collections/articles/${documentId}`,
  );
  expect(collectionHref('a/b')).toBe('/dashboard/collections/a%2Fb');
});

it('flattens the server folder tree without discarding nested folder identities', () => {
  const base = { name: 'Root', version: 1, createdAt: 'time', updatedAt: 'time' };
  expect(
    flattenFolders([
      {
        ...base,
        id: folderId,
        parentId: null,
        children: [{ ...base, id: documentId, parentId: folderId, children: [] }],
      },
    ]),
  ).toMatchObject([
    { id: folderId, depth: 0 },
    { id: documentId, parentId: folderId, depth: 1 },
  ]);
});
