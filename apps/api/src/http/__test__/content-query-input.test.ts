import { Hono } from 'hono';
import { expect, it } from 'vitest';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { routeInput } from '../contract.ts';
import type { HttpEnvironment } from '../contract.ts';

function application() {
  const app = new Hono<HttpEnvironment>();
  app.onError(
    (error) => new Response(null, { status: error instanceof CmsError ? error.status : 500 }),
  );
  app.get('/collections/:collection', async (c) => c.json(await routeInput(c, 1024)));
  return app;
}

it('decodes explicit JSON query AST, projection and locale fallback without string coercion', async () => {
  const app = application();
  const where = { and: [{ field: 'title', operator: 'contains', value: 'news' }] };
  const sort = [{ field: 'title', order: 'asc' }];
  const query = new URLSearchParams({
    where: JSON.stringify(where),
    sort: JSON.stringify(sort),
    select: JSON.stringify(['title']),
    fallback: JSON.stringify(['en']),
    locale: 'zh-CN',
    page: '2',
    pageSize: '5',
    depth: '0',
    trashed: 'false',
    folderId: 'null',
    count: 'true',
    joins: JSON.stringify({ pages: { count: false, page: 2 } }),
  });
  const response = await app.request(`http://localhost/collections/articles?${query}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    collection: 'articles',
    where,
    sort,
    select: ['title'],
    fallback: ['en'],
    locale: 'zh-CN',
    page: 2,
    pageSize: 5,
    depth: 0,
    trashed: false,
    folderId: null,
    count: true,
    joins: { pages: { count: false, page: 2 } },
  });
});

it.each([
  'depth=-1',
  'revision=0',
  'page=01',
  'trashed=1',
  'count=1',
  'joins=%7B',
  'where=%7B',
  'sort=undefined',
  'page=1&page=2',
  'collection=pages',
])('rejects ambiguous or malformed query %s', async (query) => {
  expect(
    (await application().request(`http://localhost/collections/articles?${query}`)).status,
  ).toBe(400);
});
