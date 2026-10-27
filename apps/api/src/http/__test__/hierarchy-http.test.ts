import { afterEach, expect, it } from 'vitest';
import { createHttpFixture, api } from './support.ts';
import type { HttpFixture } from './support.ts';
import { z } from 'zod';
import { bindOperations } from '../../../../../test/support/cms-api.ts';

const fixtures: HttpFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
const document = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  data: z.record(z.string(), z.unknown()),
});

it('migrates a clean installation into ready taxonomy metadata and serves tree and atomic move through Hono', async () => {
  const kit = await createHttpFixture();
  fixtures.push(kit);
  await kit.runtime.content.verifyReady();
  const request = api(kit);
  await bindOperations(request, {
    token: kit.token,
    collection: 'tags',
    code: 'hierarchy:tags',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.create',
      'documents.get',
      'documents.list',
      'documents.update',
      'hierarchy.tree',
      'hierarchy.move',
    ],
  });
  const metadata = await request('GET', '/v1/collections/tags');
  expect(metadata.status).toBe(200);
  const firstResponse = await request('POST', '/v1/collections/tags/documents', {
    body: { locale: 'en', data: { title: 'Root', slug: 'http-root' } },
  });
  expect(firstResponse.status).toBe(201);
  const first = document.parse(await firstResponse.json());
  const secondResponse = await request('POST', '/v1/collections/tags/documents', {
    body: {
      locale: 'en',
      data: { title: 'Child', slug: 'http-child', parent: { collection: 'tags', id: first.id } },
    },
  });
  expect(secondResponse.status).toBe(201);
  const second = document.parse(await secondResponse.json());
  const branch = await request(
    'GET',
    `/v1/collections/tags/hierarchy?locale=en&parentId=${first.id}`,
  );
  expect(branch.status).toBe(200);
  expect(
    z.object({ rows: z.array(document), total: z.number() }).parse(await branch.json()),
  ).toMatchObject({ rows: [{ id: second.id }], total: 1 });
  const moved = await request('POST', '/v1/collections/tags/hierarchy/moves', {
    body: { locale: 'en', parentId: null, items: [{ id: second.id, revision: second.revision }] },
  });
  expect(moved.status).toBe(200);
  expect(
    z.object({ rows: z.array(document) }).parse(await moved.json()).rows[0]?.data,
  ).toMatchObject({ parent: null, slugPath: 'http-child' });
  await kit.runtime.content.verifyReady();
});
