import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  test,
  loginManagement,
  captureApiJson,
  bffRequest,
} from '../test/support/admin-browser-management.ts';

const document = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  file: z.object({ filename: z.string() }).optional(),
});
test('saves a fileless media document, attaches its first file and renames it while preserving historical bytes', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/media/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Metadata first');
  const creating = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/media/documents', status: 201 },
    document,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const original = await creating.read();
  expect(original.file).toBeUndefined();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/media/${original.id}\\?locale=en$`),
  );
  await page.getByRole('button', { name: '添加文件', exact: true }).click();
  const bytes = Buffer.from('%PDF-1.7\nBrowser first file\n%%EOF');
  await page
    .getByLabel('选择文件', { exact: true })
    .setInputFiles({ name: 'first.pdf', mimeType: 'application/pdf', buffer: bytes });
  const attaching = await captureApiJson(
    page,
    { method: 'PATCH', path: `/v1/collections/media/documents/${original.id}`, status: 200 },
    document,
  );
  await page.getByRole('button', { name: '附加到文档', exact: true }).click();
  const attached = await attaching.read();
  await expect(page.getByRole('link', { name: '下载原件', exact: true })).toHaveAttribute(
    'download',
    'first.pdf',
  );
  await page.getByRole('button', { name: '重命名文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '重命名文件', exact: true });
  await dialog.getByLabel('文件名', { exact: true }).fill('Renamed.PDF');
  const renaming = await captureApiJson(
    page,
    {
      method: 'POST',
      path: `/v1/collections/media/documents/${original.id}/file-renames`,
      status: 200,
    },
    document,
  );
  await dialog.getByRole('button', { name: '重命名文件', exact: true }).click();
  expect((await renaming.read()).file?.filename).toBe('Renamed.PDF');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('link', { name: '下载原件', exact: true })).toHaveAttribute(
    'download',
    'Renamed.PDF',
  );
  const current = await bffRequest(page, {
    method: 'GET',
    path: `/v1/collections/media/documents/${original.id}/file`,
  });
  expect(current.status()).toBe(200);
  expect(current.headers()['content-disposition']).toContain('Renamed.PDF');
  expect(await current.body()).toEqual(bytes);
  const previous = await bffRequest(page, {
    method: 'GET',
    path: `/v1/collections/media/documents/${original.id}/file?versionId=${attached.versionId}`,
  });
  expect(previous.status()).toBe(200);
  expect(previous.headers()['content-disposition']).toContain('first.pdf');
  expect(await previous.body()).toEqual(bytes);
});
