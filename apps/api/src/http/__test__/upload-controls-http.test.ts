import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { bindOperations } from '../../../../../test/support/cms-api.ts';
import { createHttpFixture, api } from './support.ts';
import type { HttpFixture } from './support.ts';

const document = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  file: z.object({ filename: z.string() }).optional(),
});
let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
it('creates a fileless upload document, attaches the first file and renames through strict Hono routes with durable idempotency', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  const request = api(kit);
  await bindOperations(request, {
    token: kit.token,
    collection: 'media',
    code: 'upload:controls',
    operations: [
      'documents.create',
      'documents.get',
      'documents.update',
      'documents.renameFile',
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.download',
    ],
  });
  const response = await request('POST', '/v1/collections/media/documents', {
    body: { data: { title: 'Metadata first' } },
  });
  expect(response.status).toBe(201);
  const original = document.parse(await response.json());
  expect(original.file).toBeUndefined();
  const bytes = new TextEncoder().encode('%PDF-1.7\nHTTP first file\n%%EOF');
  const session = await request('POST', '/v1/collections/media/uploads', {
    body: {
      purpose: 'replace',
      documentId: original.id,
      revision: original.revision,
      filename: 'first.pdf',
      mimeType: 'application/pdf',
      bytes: bytes.length,
    },
  });
  expect(session.status).toBe(201);
  const upload = z.object({ id: z.uuid() }).parse(await session.json());
  const path = `/v1/collections/media/uploads/${upload.id}`;
  expect(
    (
      await kit.runtime.app.request(`http://localhost${path}/content`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${kit.token}`,
          'content-type': 'application/octet-stream',
        },
        body: bytes,
      })
    ).status,
  ).toBe(200);
  expect((await request('POST', `${path}/completions`, { body: {} })).status).toBe(202);
  await kit.runtime.assets.maintenance();
  expect((await request('GET', path)).status).toBe(200);
  const attachedResponse = await request(
    'PATCH',
    `/v1/collections/media/documents/${original.id}`,
    { body: { revision: original.revision, uploadId: upload.id } },
  );
  expect(attachedResponse.status).toBe(200);
  const attached = document.parse(await attachedResponse.json());
  const renames = `/v1/collections/media/documents/${original.id}/file-renames`;
  for (const body of [
    { revision: attached.revision, filename: 'new.pdf', editorSessionId: randomUUID() },
    { revision: attached.revision, filename: 'new.pdf', locale: 'all' },
    { revision: attached.revision, filename: '../new.pdf' },
  ])
    expect((await request('POST', renames, { body })).status).toBe(400);
  const key = randomUUID();
  const body = { revision: attached.revision, filename: 'New.PDF', locale: 'en' };
  const renamedResponse = await request('POST', renames, { key, body });
  expect(renamedResponse.status).toBe(200);
  const renamed = document.parse(await renamedResponse.json());
  expect(renamed.file?.filename).toBe('New.PDF');
  expect(
    document.parse(await (await request('POST', renames, { key, body })).json()).versionId,
  ).toBe(renamed.versionId);
  const file = await request('GET', `/v1/collections/media/documents/${original.id}/file`);
  expect(file.status).toBe(200);
  expect(file.headers.get('content-disposition')).toContain('New.PDF');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
  expect((await request('POST', renames, { body })).status).toBe(409);
});
