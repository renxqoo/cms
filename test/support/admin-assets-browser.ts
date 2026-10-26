import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';

export const mediaTargetSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  versionId: z.uuid(),
});

export async function privateDownload(page: Page, expected: Uint8Array) {
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载原件', exact: true }).first().click();
  const path = await (await downloaded).path();
  if (!path) throw new Error('Browser download has no saved bytes.');
  expect(new Uint8Array(await readFile(path))).toEqual(new Uint8Array(expected));
}

export async function uploadFile(
  page: Page,
  input: {
    name: string;
    bytes: Uint8Array;
    mimeType: string;
    target?: { id: string; revision: number };
  },
) {
  const { name, bytes, mimeType, target } = input;
  const { origin } = new URL(page.url());
  const upload = await page.request.post('/api/cms/v1/collections/media/uploads', {
    headers: { origin, 'idempotency-key': randomUUID() },
    data: {
      purpose: target ? 'replace' : 'create',
      filename: name,
      mimeType,
      bytes: bytes.byteLength,
      ...(target ? { documentId: target.id, revision: target.revision } : {}),
    },
  });
  expect(upload.status()).toBe(201);
  const { id } = z.object({ id: z.uuid() }).parse(await upload.json());
  expect(
    (
      await page.request.put(`/api/cms/v1/collections/media/uploads/${id}/content`, {
        headers: { origin, 'content-type': 'application/octet-stream' },
        data: Buffer.from(bytes),
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post(`/api/cms/v1/collections/media/uploads/${id}/completions`, {
        headers: { origin, 'idempotency-key': randomUUID() },
        data: {},
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/cms/v1/collections/media/uploads/${id}`);
        return z.object({ status: z.string() }).parse(await response.json()).status;
      },
      { intervals: [250] },
    )
    .toBe('ready');
  return id;
}

export async function seedMedia(page: Page, name: string, bytes: Uint8Array) {
  const id = await uploadFile(page, { name, bytes, mimeType: 'image/png' });
  const { origin } = new URL(page.url());
  const created = await page.request.post('/api/cms/v1/collections/media/documents', {
    headers: { origin, 'idempotency-key': randomUUID() },
    data: { locale: 'en', data: { title: name }, uploadId: id },
  });
  expect(created.status()).toBe(201);
  return mediaTargetSchema.parse(await created.json());
}
