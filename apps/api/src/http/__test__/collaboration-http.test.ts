import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { editorLeaseSchema } from '@new-cms/cms/content';
import { bindOperations, contentDocument } from '../../../../../test/support/cms-api.ts';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
it('registers collaboration endpoints and their exact contracts with actual lease ownership and generation checks', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const client = api(kit);
  await bindOperations(client, {
    token: kit.token,
    collection: 'articles',
    code: 'collaboration:articles',
    operations: [
      'documents.create',
      'documents.get',
      'documents.update',
      'documents.getLock',
      'documents.acquireLock',
      'documents.releaseLock',
      'documents.unlock',
      'documents.preview',
    ],
  });
  const created = contentDocument.parse(
    await (
      await client('POST', '/v1/collections/articles/documents', {
        body: { data: { title: 'Leased story' } },
      })
    ).json(),
  );
  const path = `/v1/collections/articles/documents/${created.id}`;
  const editorId = randomUUID();
  const acquired = await client('PUT', `${path}/lock`, { body: { editorId } });
  expect(acquired.status).toBe(200);
  expect(editorLeaseSchema.parse(await acquired.json())).toMatchObject({
    enabled: true,
    owned: true,
    lease: { generation: 1 },
  });
  expect((await client('GET', `${path}/lock?editorId=${editorId}`)).status).toBe(200);
  expect((await client('DELETE', `${path}/lock?editorId=${editorId}&generation=1`)).status).toBe(
    200,
  );
  expect((await client('DELETE', `${path}/lock?editorId=${editorId}&generation=0`)).status).toBe(
    400,
  );
  expect(
    (await client('POST', `${path}/unlocks`, { body: { editorId, generation: 1 } })).status,
  ).toBe(409);
  expect((await client('GET', `${path}/preview`)).status).toBe(404);
  const invalidHeader = await kit.runtime.app.request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${kit.token}`,
      'content-type': 'application/json',
      'x-cms-editor-session': 'invalid',
    },
    body: JSON.stringify({ revision: created.revision, data: { title: 'Blocked' } }),
  });
  expect(invalidHeader.status).toBe(400);
  const specification = z
    .object({
      paths: z.record(z.string(), z.record(z.string(), z.unknown())),
      components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
    })
    .parse(await (await client('GET', '/openapi.json')).json());
  expect(specification.paths['/v1/collections/{collection}/documents/{id}/lock']).toHaveProperty(
    'put',
  );
  expect(specification.paths['/v1/collections/{collection}/documents/{id}/preview']).toHaveProperty(
    'get',
  );
  expect(specification.components.schemas['EditorLease']).toMatchObject({
    additionalProperties: false,
  });
});
