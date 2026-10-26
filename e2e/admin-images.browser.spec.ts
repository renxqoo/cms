import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { png } from '../test/support/png.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';
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
