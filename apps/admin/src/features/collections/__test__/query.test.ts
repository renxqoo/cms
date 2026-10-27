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

it('regression: collection lists honor the configured default language rather than supported-language order', () => {
  const configured = catalog({ locales: ['zh-CN', 'en'] });
  expect(parseDocumentQuery(new URLSearchParams(), configured).locale).toBe('en');
  expect(parseDocumentQuery(new URLSearchParams('locale=unknown'), configured).locale).toBe('en');
});

it('uses a collection pagination default while preserving a valid explicit URL page size', () => {
  const collection = catalog({ admin: { pagination: { defaultLimit: 7, limits: [7, 21] } } });
  expect(parseDocumentQuery(new URLSearchParams(), collection).pageSize).toBe(7);
  expect(parseDocumentQuery(new URLSearchParams('pageSize=21'), collection).pageSize).toBe(21);
  expect(parseDocumentQuery(new URLSearchParams('pageSize=1000'), collection).pageSize).toBe(7);
});

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
    sort: [{ field: 'updatedAt', order: 'desc' }],
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
    locale: 'zh-CN',
    folderId: null,
  });
  expect(
    parseDocumentQuery(
      new URLSearchParams({ folderId, sort: JSON.stringify([{ field: 'title', order: 'asc' }]) }),
      catalog(),
    ),
  ).toMatchObject({ folderId, sort: [{ field: 'title', order: 'asc' }] });
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

it('uses safe collection defaults and excludes a non-sortable field from URL ordering', () => {
  const configured = catalog({
    defaultSort: [
      { field: 'title', order: 'asc' },
      { field: 'count', order: 'desc' },
    ],
  });
  configured.fields.push({
    id: 'tags',
    path: 'tags',
    type: 'select',
    label: 'Tags',
    required: false,
    localized: false,
    queryable: true,
    sortable: false,
  });
  expect(parseDocumentQuery(new URLSearchParams(), configured).sort).toEqual([
    { field: 'title', order: 'asc' },
    { field: 'count', order: 'desc' },
  ]);
  expect(
    parseDocumentQuery(
      new URLSearchParams({ sort: JSON.stringify([{ field: 'tags', order: 'asc' }]) }),
      configured,
    ).sort,
  ).toEqual([
    { field: 'title', order: 'asc' },
    { field: 'count', order: 'desc' },
  ]);
});

it('constructs typed field filters only for queryable safe metadata', () => {
  const query = parseDocumentQuery(new URLSearchParams(), catalog());
  expect(queryFilter(query, catalog())).toEqual({ valid: true, where: undefined });
  expect(
    queryFilter(
      { ...query, where: JSON.stringify({ field: 'hidden', operator: 'eq', value: 'secret' }) },
      catalog(),
    ).valid,
  ).toBe(false);
  expect(
    queryFilter(
      { ...query, where: JSON.stringify({ field: 'count', operator: 'eq', value: 0 }) },
      catalog(),
    ).where,
  ).toEqual({ field: 'count', operator: 'eq', value: 0 });
  for (const value of ['', 'Infinity', 'wrong'])
    expect(
      queryFilter(
        { ...query, where: JSON.stringify({ field: 'count', operator: 'eq', value }) },
        catalog(),
      ).valid,
    ).toBe(false);
  expect(
    queryFilter(
      { ...query, where: JSON.stringify({ field: 'active', operator: 'eq', value: false }) },
      catalog(),
    ).where,
  ).toEqual({ field: 'active', operator: 'eq', value: false });
  expect(
    queryFilter(
      { ...query, where: JSON.stringify({ field: 'active', operator: 'eq', value: '1' }) },
      catalog(),
    ).valid,
  ).toBe(false);
  expect(
    queryFilter(
      { ...query, where: JSON.stringify({ field: 'title', operator: 'eq', value: '文字' }) },
      catalog(),
    ).where,
  ).toEqual({ field: 'title', operator: 'eq', value: '文字' });
});

it('regression: URL query parsing retains server-supported views above historical fixed field caps', () => {
  const fields = Array.from({ length: 501 }, (_, index) => ({
    id: `field${index}`,
    path: `field${index}`,
    type: 'text',
    label: `Field ${index}`,
    required: false,
    localized: false,
    queryable: true,
    sortable: true,
  }));
  const configured = catalog({ fields });
  const sort = fields.slice(0, 101).map((field) => ({ field: field.path, order: 'asc' }));
  const columns = fields.map((field) => field.path);
  expect(
    parseDocumentQuery(
      new URLSearchParams({ sort: JSON.stringify(sort), columns: JSON.stringify(columns) }),
      configured,
    ),
  ).toMatchObject({ sort, columns });
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
