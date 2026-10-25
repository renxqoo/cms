import { expect, it } from 'vitest';
import { z } from 'zod';
import { createCmsProcess } from '../test/support/cms-process.ts';
import { bindOperations, contentDocument, waitForJob } from '../test/support/cms-api.ts';
import { png } from '../test/support/png.ts';

async function upload(
  kit: Awaited<ReturnType<typeof createCmsProcess>>,
  input: { bytes: Buffer; document?: { id: string; revision: number } },
) {
  const created = await kit.request('POST', '/v1/collections/media/uploads', {
    ...kit.owner,
    body: {
      purpose: input.document ? 'replace' : 'create',
      filename: '测试 image.png',
      mimeType: 'image/png',
      bytes: input.bytes.length,
      ...(input.document
        ? { documentId: input.document.id, revision: input.document.revision }
        : {}),
    },
  });
  expect(created.status).toBe(201);
  const session = z.object({ id: z.uuid() }).parse(await created.json());
  const written = await fetch(
    `http://127.0.0.1:${kit.port()}/v1/collections/media/uploads/${session.id}/content`,
    {
      method: 'PUT',
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${kit.owner.token}`,
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array(input.bytes).buffer,
    },
  );
  expect(written.status).toBe(200);
  const completed = await kit.request(
    'POST',
    `/v1/collections/media/uploads/${session.id}/completions`,
    { ...kit.owner, body: {} },
  );
  expect(completed.status).toBe(202);
  const processing = z.object({ jobId: z.uuid() }).parse(await completed.json());
  await waitForJob(kit.request, {
    ...kit.owner,
    collection: 'media',
    jobId: processing.jobId,
    status: 'succeeded',
  });
  return session.id;
}

const mediaOperations = [
  'collections.get',
  'documents.create',
  'documents.update',
  'documents.get',
  'documents.list',
  'versions.get',
  'assets.createUpload',
  'assets.writeUpload',
  'assets.completeUpload',
  'assets.readUpload',
  'assets.cancelUpload',
  'assets.download',
  'assets.reprocess',
  'content.getJob',
];
it.each(['bun', 'node'] as const)(
  '%s keeps original bytes and authorized historical media bindings after replacement and reprocessing',
  async (mode) => {
    const kit = await createCmsProcess(mode);
    try {
      await bindOperations(kit.request, {
        ...kit.owner,
        collection: 'media',
        code: 'content:media:manage',
        operations: mediaOperations,
      });
      await bindOperations(kit.request, {
        ...kit.owner,
        collection: 'articles',
        code: 'content:articles:manage',
        operations: ['documents.create', 'documents.get', 'assets.downloadBinding'],
      });
      const first = png([255, 0, 0]);
      const second = png([0, 0, 255]);
      const uploadId = await upload(kit, { bytes: first });
      const createdResponse = await kit.request('POST', '/v1/collections/media/documents', {
        ...kit.owner,
        body: {
          uploadId,
          data: { title: 'Licensed illustration', alt: 'Red image', copyright: 'Original owner' },
        },
      });
      expect(createdResponse.status).toBe(201);
      const media = contentDocument.parse(await createdResponse.json());
      expect(media.file).toBeDefined();
      const articleResponse = await kit.request('POST', '/v1/collections/articles/documents', {
        ...kit.owner,
        body: {
          data: {
            title: 'Article with media',
            slug: 'media-story',
            cover: { collection: 'media', id: media.id },
          },
        },
      });
      expect(articleResponse.status).toBe(201);
      const article = contentDocument.parse(await articleResponse.json());
      const binding = article.mediaBindings?.find((item) => item.sourcePath.endsWith('cover'));
      if (!binding) throw new Error('Expected visible fixed media binding');
      const file = `/v1/collections/media/documents/${media.id}/file`;
      expect(Buffer.from(await (await kit.request('GET', file, kit.owner)).arrayBuffer())).toEqual(
        first,
      );
      const replacementId = await upload(kit, { bytes: second, document: media });
      const replacedResponse = await kit.request(
        'PATCH',
        `/v1/collections/media/documents/${media.id}`,
        { ...kit.owner, body: { revision: media.revision, uploadId: replacementId } },
      );
      expect(replacedResponse.status).toBe(200);
      const replaced = contentDocument.parse(await replacedResponse.json());
      expect(replaced.file?.id).not.toBe(media.file?.id);
      expect(Buffer.from(await (await kit.request('GET', file, kit.owner)).arrayBuffer())).toEqual(
        second,
      );
      expect(
        Buffer.from(
          await (
            await kit.request('GET', `${file}?versionId=${media.versionId}`, kit.owner)
          ).arrayBuffer(),
        ),
      ).toEqual(first);
      const historical = `/v1/collections/articles/documents/${article.id}/media-bindings/${binding.bindingId}/file`;
      expect(
        Buffer.from(await (await kit.request('GET', historical, kit.owner)).arrayBuffer()),
      ).toEqual(first);
      const head = await kit.request('HEAD', historical, kit.owner);
      expect(head.status).toBe(200);
      expect(head.headers.get('content-length')).toBe(String(first.length));
      expect((await head.arrayBuffer()).byteLength).toBe(0);
      expect(head.headers.get('content-disposition')).toContain('filename*=UTF-8');
      expect((await kit.request('GET', historical)).status).toBe(401);
      const reprocessResponse = await kit.request(
        'POST',
        `/v1/collections/media/documents/${media.id}/file-processings`,
        {
          ...kit.owner,
          body: {
            revision: replaced.revision,
            recipe: {
              focalPoint: { x: 1, y: 0 },
              variants: [
                { name: 'square', width: 1, height: 1, fit: 'cover', format: 'png', quality: 90 },
              ],
            },
          },
        },
      );
      expect(reprocessResponse.status).toBe(202);
      const reprocess = z.object({ jobId: z.uuid() }).parse(await reprocessResponse.json());
      const result = await waitForJob(kit.request, {
        ...kit.owner,
        collection: 'media',
        jobId: reprocess.jobId,
        status: 'succeeded',
      });
      const manifest = z
        .object({
          objects: z.array(
            z.object({
              name: z.string(),
              width: z.number().nullable(),
              height: z.number().nullable(),
            }),
          ),
        })
        .parse(result.manifest);
      expect(manifest.objects.find((item) => item.name === 'square')).toMatchObject({
        width: 1,
        height: 1,
      });
      await kit.restart();
      expect(
        Buffer.from(await (await kit.request('GET', historical, kit.owner)).arrayBuffer()),
      ).toEqual(first);
      expect(Buffer.from(await (await kit.request('GET', file, kit.owner)).arrayBuffer())).toEqual(
        second,
      );
      const square = await kit.request('GET', `${file}?variant=square`, kit.owner);
      expect(square.status).toBe(200);
      expect(square.headers.get('content-type')).toBe('image/png');
      expect((await square.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      await kit.close();
    }
  },
);
