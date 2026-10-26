import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { png } from '../test/support/png.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  test,
  loginManagement,
  waitForApi,
  expectHttp,
} from '../test/support/admin-browser-management.ts';
import {
  seedMedia,
  mediaTargetSchema,
  uploadFile,
  privateDownload,
} from '../test/support/admin-assets-browser.ts';

test('downloads fixed historical reference bytes and removes private previews after runtime download permission is revoked', async ({
  page,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const original = png([88, 77, 66]);
  const replacement = png([11, 22, 33]);
  const media = await seedMedia(page, 'fixed-original.png', original);
  const { origin } = new URL(page.url());
  const article = await page.request.post('/api/cms/v1/collections/articles/documents', {
    headers: { origin, 'idempotency-key': randomUUID() },
    data: {
      locale: 'en',
      data: {
        title: 'Fixed reference',
        slug: `fixed-${randomUUID()}`,
        cover: { collection: 'media', id: media.id },
      },
    },
  });
  expect(article.status()).toBe(201);
  const source = mediaTargetSchema.parse(await article.json());
  const replacementId = await uploadFile(page, {
    name: 'fixed-new.png',
    bytes: replacement,
    mimeType: 'image/png',
    target: media,
  });
  expect(
    (
      await page.request.patch(`/api/cms/v1/collections/media/documents/${media.id}`, {
        headers: { origin },
        data: { revision: media.revision, uploadId: replacementId },
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/dashboard/collections/articles/${source.id}`);
  const fixed = page.getByRole('heading', { name: '固定媒体引用', exact: true }).locator('..');
  const saved = page.waitForEvent('download');
  await fixed.getByRole('link', { name: '下载原件', exact: true }).click();
  const downloadPath = await (await saved).path();
  if (!downloadPath) throw new Error('Fixed media download has no bytes.');
  expect(new Uint8Array(await readFile(downloadPath))).toEqual(new Uint8Array(original));
  await page.goto(`/dashboard/collections/media/${media.id}`);
  await privateDownload(page, replacement);
  const endpoints = await page.request.get('/api/cms/v1/endpoints?module=assets&pageSize=100');
  expect(endpoints.status()).toBe(200);
  const { rows } = z
    .object({
      rows: z.array(
        z.object({
          operationId: z.string(),
          collectionKey: z.string().nullable(),
          binding: z.object({ id: z.uuid(), version: z.number().int().positive() }).nullable(),
        }),
      ),
    })
    .parse(await endpoints.json());
  const binding = rows.find(
    (row) => row.operationId === 'assets.download' && row.collectionKey === 'media',
  )?.binding;
  if (!binding) throw new Error('The isolated fixture requires a media download binding.');
  expect(
    (
      await page.request.delete(
        `/api/cms/v1/endpoint-bindings/${binding.id}?version=${binding.version}`,
        { headers: { origin } },
      )
    ).status(),
  ).toBe(204);
  const current = await page.request.get(
    `/api/cms/v1/collections/media/documents/${media.id}?locale=en&fallback=%5B%5D&depth=0`,
  );
  expect(current.status()).toBe(200);
  const { versionId } = mediaTargetSchema.parse(await current.json());
  const path = `/v1/collections/media/documents/${media.id}/file?versionId=${encodeURIComponent(versionId)}&mode=editing&variant=original`;
  expectHttp(page, browserErrors, { method: 'GET', path, status: 403 });
  const rejected = waitForApi(page, 'GET', `/v1/collections/media/documents/${media.id}/file`);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  expect((await rejected).status()).toBe(403);
  await expect(page.getByRole('img', { name: 'fixed-new.png', exact: true })).toHaveCount(0);
});
