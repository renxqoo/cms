import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { documentOrderStateSchema } from '@new-cms/cms/content';
import { bindOperations } from '../../../../../test/support/cms-api.ts';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
it('round trips opaque ordering CAS through authorized Hono routes and strict public DTOs', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  const path = '/v1/collections/articles/document-order';
  expect((await client('GET', path)).status).toBe(403);
  await bindOperations(client, {
    token: kit.token,
    collection: 'articles',
    code: 'ordering:manage',
    operations: [
      'documents.order',
      'documents.reorder',
      'documents.list',
      'documents.update',
      'documents.create',
    ],
  });
  const ids: string[] = [];
  for (const [title, slug] of [
    ['Zee', 'ordering-zee'],
    ['Alpha', 'ordering-alpha'],
  ]) {
    const response = await client('POST', '/v1/collections/articles/documents', {
      body: { data: { title, slug } },
    });
    expect(response.status).toBe(201);
    ids.push(z.object({ id: z.uuid() }).parse(await response.json()).id);
  }
  const state = documentOrderStateSchema.parse(
    await (await client('GET', `${path}?locale=zh-CN`)).json(),
  );
  const input = {
    locale: 'zh-CN',
    version: state.version,
    ids: [ids[1]],
    targetId: ids[0],
    position: 'before',
  };
  const response = await client('POST', path, { body: input });
  expect(response.status).toBe(200);
  const changed = documentOrderStateSchema.parse(await response.json());
  expect(changed.version).not.toBe(state.version);
  expect((await client('POST', path, { body: input })).status).toBe(409);
  const sort = encodeURIComponent(JSON.stringify([{ field: '_order', order: 'asc' }]));
  const listed = await client('GET', `/v1/collections/articles/documents?sort=${sort}`);
  expect(
    z
      .object({ rows: z.array(z.object({ id: z.uuid() })), total: z.number() })
      .parse(await listed.json()),
  ).toMatchObject({ rows: [{ id: ids[1] }, { id: ids[0] }], total: 2 });
  expect((await client('GET', `${path}?locale=unknown`)).status).toBe(400);
});
