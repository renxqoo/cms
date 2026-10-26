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

test('uses original pixel dimensions for crop and waits for reprocessing to create a new persisted revision', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const target = await seedMedia(page, 'to-process.png', png([17, 18, 19]));
  await page.goto(`/dashboard/collections/media/${target.id}`);
  await page.getByRole('button', { name: '编辑图片', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑图片', exact: true });
  await dialog.getByLabel('裁剪宽度', { exact: true }).fill('0.5');
  const accepted = waitForApi(
    page,
    'POST',
    `/v1/collections/media/documents/${target.id}/file-processings`,
  );
  await dialog.getByRole('button', { name: '处理图片', exact: true }).last().click();
  expect((await accepted).status()).toBe(202);
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '编辑图片', exact: true }).click({ trial: true });
  await expect(
    page.getByText('图片处理已受理，正在等待持久化任务结果。', { exact: true }),
  ).toHaveCount(0);
  const fresh = await page.request.get(
    `/api/cms/v1/collections/media/documents/${target.id}?locale=en&fallback=%5B%5D&depth=0`,
  );
  expect(fresh.status()).toBe(200);
  expect(mediaTargetSchema.parse(await fresh.json()).revision).toBeGreaterThan(target.revision);
  await expect(page.getByRole('button', { name: '编辑图片', exact: true })).toBeEnabled();
});

test('downloads private PDF bytes without embedding an executable document preview', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const bytes = pdfBytes();
  const uploadId = await uploadFile(page, {
    name: 'private-document.pdf',
    bytes,
    mimeType: 'application/pdf',
  });
  const { origin } = new URL(page.url());
  const created = await page.request.post('/api/cms/v1/collections/media/documents', {
    headers: { origin, 'idempotency-key': randomUUID() },
    data: { locale: 'en', data: { title: 'Private PDF' }, uploadId },
  });
  expect(created.status()).toBe(201);
  const target = mediaTargetSchema.parse(await created.json());
  await page.goto(`/dashboard/collections/media/${target.id}`);
  await expect(page.getByText('请下载后查看此文件。', { exact: true })).toBeVisible();
  await expect(page.locator('iframe,object,embed')).toHaveCount(0);
  await privateDownload(page, bytes);
});

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
  const path = `/v1/collections/media/documents/${media.id}/file?versionId=${encodeURIComponent(mediaTargetSchema.parse(await (await page.request.get(`/api/cms/v1/collections/media/documents/${media.id}?locale=en&fallback=%5B%5D&depth=0`)).json()).versionId)}&mode=editing&variant=original`;
  expectHttp(page, browserErrors, { method: 'GET', path, status: 403 });
  const rejected = waitForApi(page, 'GET', `/v1/collections/media/documents/${media.id}/file`);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  expect((await rejected).status()).toBe(403);
  await expect(page.getByRole('img', { name: 'fixed-new.png', exact: true })).toHaveCount(0);
});

function pdfBytes() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R /Resources <<>> >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
