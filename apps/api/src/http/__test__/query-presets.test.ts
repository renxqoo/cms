import { afterEach, expect, it } from 'vitest';
import { queryPresetSchema, queryPresetPageSchema } from '@new-cms/cms/content';
import { bindOperations } from '../../../../../test/support/cms-api.ts';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('round trips query presets through authenticated Hono routes and strict public DTOs', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const path = '/v1/collections/articles/query-presets';
  expect((await client('GET', path)).status).toBe(403);
  await bindOperations(client, {
    token: kit.token,
    collection: 'articles',
    code: 'presets:manage',
    operations: [
      'documents.list',
      'queryPresets.list',
      'queryPresets.create',
      'queryPresets.update',
      'queryPresets.share',
      'queryPresets.delete',
    ],
  });
  const query = {
    q: '',
    sort: [{ field: 'title', order: 'asc' }],
    columns: ['title'],
    where: {
      or: [
        { field: 'title', operator: 'like', value: 'Editorial' },
        { field: 'title', operator: 'eq', value: 'News' },
      ],
    },
  };
  const created = await client('POST', path, {
    body: { name: 'Editorial', query, locale: 'zh-CN' },
  });
  expect(created.status).toBe(201);
  const row = queryPresetSchema.parse(await created.json());
  const listed = queryPresetPageSchema.parse(
    await (await client('GET', `${path}?page=1&pageSize=1&locale=zh-CN`)).json(),
  );
  expect(listed.rows.map((entry) => entry.id)).toEqual([row.id]);
  expect(listed.total).toBe(1);
  const shared = await client('PUT', `${path}/${row.id}/sharing`, {
    body: {
      version: row.version,
      access: {
        read: { constraint: 'everyone' },
        update: { constraint: 'onlyMe' },
        delete: { constraint: 'onlyMe' },
      },
      locale: 'zh-CN',
    },
  });
  expect(shared.status).toBe(200);
  const current = queryPresetSchema.parse(await shared.json());
  expect(current).toMatchObject({
    shared: true,
    access: {
      read: { constraint: 'everyone' },
      update: { constraint: 'onlyMe' },
      delete: { constraint: 'onlyMe' },
    },
    version: 2,
  });
  expect(
    (
      await client('PATCH', `${path}/${row.id}`, {
        body: { version: 1, name: 'Stale', query, locale: 'zh-CN' },
      })
    ).status,
  ).toBe(409);
  expect(
    (await client('POST', path, { body: { name: 'Unknown', query, ownerId: kit.admin.id } }))
      .status,
  ).toBe(400);
  expect((await client('DELETE', `${path}/${row.id}?version=2&locale=zh-CN`)).status).toBe(204);
  const empty = queryPresetPageSchema.parse(await (await client('GET', path)).json());
  expect(empty).toMatchObject({ total: 0, rows: [] });
});
