import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { bindOperations } from '../../../../../test/support/cms-api.ts';
import { createHttpFixture, api } from './support.ts';
import type { HttpFixture } from './support.ts';

const fixtures: HttpFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
it('exposes one strict Hono copy-locale route with persisted destination values and rejects multi-locale reads', async () => {
  const kit = await createHttpFixture();
  fixtures.push(kit);
  const request = api(kit);
  await bindOperations(request, {
    token: kit.token,
    collection: 'articles',
    code: 'locale:copy',
    operations: ['documents.create', 'documents.get', 'documents.update', 'documents.copyLocale'],
  });
  const created = await request('POST', '/v1/collections/articles/documents', {
    body: {
      dataByLocale: {
        en: { title: 'Source', summary: 'Copied summary' },
        'zh-CN': { title: 'Preserved target' },
      },
    },
  });
  expect(created.status).toBe(201);
  const source = z.object({ id: z.uuid(), revision: z.number() }).parse(await created.json());
  const path = `/v1/collections/articles/documents/${source.id}/locale-copies`;
  const body = { revision: source.revision, fromLocale: 'en', toLocale: 'zh-CN' };
  for (const invalid of [
    { ...body, fromLocale: 'all' },
    { ...body, toLocale: 'all' },
    { ...body, fallback: ['en'] },
    { ...body, overwrite: 'yes' },
  ])
    expect((await request('POST', path, { body: invalid })).status).toBe(400);
  const copied = await request('POST', path, { body });
  expect(copied.status).toBe(200);
  expect(
    z.object({ data: z.record(z.string(), z.unknown()) }).parse(await copied.json()).data,
  ).toMatchObject({ title: 'Preserved target', summary: 'Copied summary' });
  const stored = await request(
    'GET',
    `/v1/collections/articles/documents/${source.id}?locale=zh-CN&fallback=[]`,
  );
  expect(stored.status).toBe(200);
  expect(
    z.object({ data: z.record(z.string(), z.unknown()) }).parse(await stored.json()).data[
      'summary'
    ],
  ).toBe('Copied summary');
});
