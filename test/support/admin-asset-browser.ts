import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import type { Download, Page } from '@playwright/test';
import { z } from 'zod';
import { browserDocument, contentRequest } from './admin-content-browser.ts';

export const mediaBrowserOperations = [
  'collections.get',
  'collections.editor',
  'documents.create',
  'documents.get',
  'documents.list',
  'documents.update',
  'assets.createUpload',
  'assets.writeUpload',
  'assets.completeUpload',
  'assets.readUpload',
  'assets.cancelUpload',
  'assets.listUploads',
  'assets.download',
  'content.getJob',
] as const;

export const browserMediaDocument = browserDocument.extend({
  file: z.object({
    id: z.uuid(),
    filename: z.string(),
    mimeType: z.string(),
    digest: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    recipe: z.object({
      crop: z
        .object({ left: z.number(), top: z.number(), width: z.number(), height: z.number() })
        .optional(),
      focalPoint: z.object({ x: z.number(), y: z.number() }).optional(),
      variants: z.array(
        z.object({ name: z.string(), width: z.number(), height: z.number(), format: z.string() }),
      ),
    }),
    objects: z.array(
      z.object({ name: z.string(), width: z.number().nullable(), height: z.number().nullable() }),
    ),
  }),
});

export async function downloadBytes(download: Download) {
  const path = await download.path();
  if (!path) throw new Error('The real browser download must produce a file.');
  return readFile(path);
}

export function waitForReadyUpload(page: Page) {
  return page.waitForResponse(
    async (response) =>
      response.request().method() === 'GET' &&
      /^\/api\/cms\/v1\/collections\/media\/uploads\/[0-9a-f-]+$/.test(
        new URL(response.url()).pathname,
      ) &&
      response.status() === 200 &&
      z.object({ status: z.string() }).parse(await response.json()).status === 'ready',
  );
}

export async function createReadyUpload(
  page: Page,
  input: { bytes: Buffer; filename: string; mimeType: string },
) {
  const created = await contentRequest(page, {
    method: 'POST',
    path: '/v1/collections/media/uploads',
    idempotent: true,
    data: {
      purpose: 'create',
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes.length,
    },
  });
  expect(created.status()).toBe(201);
  const session = z.object({ id: z.uuid() }).parse(await created.json());
  const path = `/v1/collections/media/uploads/${session.id}`;
  const written = await page.request.put(`/api/cms${path}/content`, {
    headers: { origin: new URL(page.url()).origin, 'content-type': 'application/octet-stream' },
    data: input.bytes,
  });
  expect(written.status()).toBe(200);
  const completed = await contentRequest(page, {
    method: 'POST',
    path: `${path}/completions`,
    idempotent: true,
    data: {},
  });
  expect(completed.status()).toBe(202);
  const receipt = z.object({ jobId: z.uuid() }).parse(await completed.json());
  await readyUpload(page, path);
  return { uploadId: session.id, jobId: receipt.jobId };
}

async function readyUpload(page: Page, path: string) {
  let terminal: string | null = null;
  await expect
    .poll(
      async () => {
        if (terminal) return terminal;
        const response = await contentRequest(page, { method: 'GET', path });
        if (response.status() !== 200) return (terminal = `HTTP ${response.status()}`);
        const current = z.object({ status: z.string() }).parse(await response.json());
        if (['failed', 'cancelled', 'expired'].includes(current.status)) terminal = current.status;
        return current.status;
      },
      {
        message:
          'The real processing job must produce a ready upload before preparing a media document.',
      },
    )
    .toBe('ready');
}

export async function createReadyMedia(
  page: Page,
  input: { bytes: Buffer; filename: string; mimeType: string; title: string },
) {
  const session = await createReadyUpload(page, input);
  const document = await contentRequest(page, {
    method: 'POST',
    path: '/v1/collections/media/documents',
    idempotent: true,
    data: { locale: 'en', uploadId: session.uploadId, data: { title: input.title } },
  });
  expect(document.status()).toBe(201);
  return {
    document: browserMediaDocument.parse(await document.json()),
    uploadId: session.uploadId,
    jobId: session.jobId,
  };
}

declare global {
  interface Window {
    oneasterBlobLifecycle: { created: string[]; revoked: string[] };
  }
}

export async function observeBlobUrls(page: Page) {
  await page.addInitScript(() => {
    const records = { created: [] as string[], revoked: [] as string[] };
    window.oneasterBlobLifecycle = records;
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      records.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      records.revoked.push(url);
      revoke(url);
    };
  });
}

export async function expectReleasedBlobs(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { created, revoked } = window.oneasterBlobLifecycle;
          return created.filter((url) => !revoked.includes(url));
        }),
      { message: 'Closing or denying private previews must revoke every created object URL.' },
    )
    .toEqual([]);
}
