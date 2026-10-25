import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { bindOperations, contentDocument } from '../../../../../test/support/cms-api.ts';
import { png } from '../../../../../test/support/png.ts';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('streams authenticated uploads and private original/variant downloads through the content facade', async () => {
  fixture = await createHttpFixture();
  const client = api(fixture);
  const owner = { token: fixture.token };
  await bindOperations(client, {
    ...owner,
    collection: 'media',
    code: 'content:media:manage',
    operations: [
      'collections.get',
      'documents.create',
      'documents.get',
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.download',
      'content.getJob',
    ],
  });
  const bytes = png([12, 34, 56]);
  const uploadResponse = await client('POST', '/v1/collections/media/uploads', {
    body: { purpose: 'create', filename: '图片.png', mimeType: 'image/png', bytes: bytes.length },
  });
  expect(uploadResponse.status).toBe(201);
  const upload = z.object({ id: z.uuid() }).parse(await uploadResponse.json());
  const path = `/v1/collections/media/uploads/${upload.id}`;
  const write = (headers: Record<string, string>, query = '') =>
    fixture?.runtime.app.request(`http://localhost${path}/content${query}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${owner.token}`, ...headers },
      body: new Uint8Array(bytes).buffer,
    });
  expect((await write({ 'content-type': 'application/json' }))?.status).toBe(415);
  expect(
    (await write({ 'content-type': 'application/octet-stream' }, '?unexpected=1'))?.status,
  ).toBe(400);
  expect(
    (await write({ 'content-type': 'application/octet-stream', 'content-encoding': 'gzip' }))
      ?.status,
  ).toBe(415);
  expect((await write({ 'content-type': 'application/octet-stream' }))?.status).toBe(200);
  expect((await client('POST', `${path}/completions`, { body: {} })).status).toBe(202);
  await fixture.runtime.assets.maintenance();
  const session = await client('GET', path);
  expect(z.object({ status: z.literal('ready') }).parse(await session.json()).status).toBe('ready');
  const created = await client('POST', '/v1/collections/media/documents', {
    body: { uploadId: upload.id, data: { title: 'Image', alt: 'Color sample' } },
  });
  expect(created.status).toBe(201);
  const media = contentDocument.parse(await created.json());
  const file = `/v1/collections/media/documents/${media.id}/file`;
  const download = await client('GET', file);
  expect(download.status).toBe(200);
  expect(download.headers.get('content-disposition')).toContain('filename*=UTF-8');
  expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  const head = await client('HEAD', file);
  expect(head.status).toBe(200);
  expect(head.headers.get('content-length')).toBe(String(bytes.length));
  expect((await head.arrayBuffer()).byteLength).toBe(0);
  const variant = await client('GET', `${file}?variant=thumbnail`);
  expect(variant.status).toBe(200);
  expect(variant.headers.get('content-type')).toBe('image/webp');
  expect((await variant.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect((await client('HEAD', file, { token: null })).status).toBe(401);
  const description = await client('GET', '/openapi.json');
  const document = z
    .object({ components: z.object({ schemas: z.record(z.string(), z.unknown()) }) })
    .parse(await description.json());
  expect(document.components.schemas.CollectionData_media).toBeDefined();
  expect(document.components.schemas.CollectionData_articles).toBeUndefined();
});
