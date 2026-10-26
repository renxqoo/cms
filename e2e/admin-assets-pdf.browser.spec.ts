import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import { grantContentOperations, waitForContent } from '../test/support/admin-content-browser.ts';
import {
  browserMediaDocument,
  downloadBytes,
  expectReleasedBlobs,
  mediaBrowserOperations,
  observeBlobUrls,
  waitForReadyUpload,
} from '../test/support/admin-asset-browser.ts';

test('real PDF bytes stay private, attach through the document UI and download without an active document embed', async ({
  page,
}) => {
  await observeBlobUrls(page);
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, { collection: 'media', operations: mediaBrowserOperations });
  const bytes = Buffer.from('%PDF-1.7\nOneAster private browser PDF\n%%EOF\n');
  await page.goto('/dashboard/resources?collection=media');
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '上传文件', exact: true });
  const ready = waitForReadyUpload(page);
  await dialog
    .getByLabel('选择文件', { exact: true })
    .setInputFiles({ name: 'private-browser.pdf', mimeType: 'application/pdf', buffer: bytes });
  await ready;
  await dialog.getByRole('button', { name: '创建资源文档', exact: true }).click();
  await page.getByLabel(/^title/).fill('Private PDF document');
  const creating = waitForContent(page, {
    method: 'POST',
    path: '/v1/collections/media/documents',
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const document = browserMediaDocument.parse(await created.json());
  expect(document.file).toMatchObject({
    mimeType: 'application/pdf',
    width: null,
    height: null,
    digest: createHash('sha256').update(bytes).digest('hex'),
  });
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/media/${document.id}\\?locale=en$`),
  );
  await page.goto('/dashboard/resources?collection=media');
  await page.getByRole('button', { name: 'private-browser.pdf', exact: true }).click();
  const details = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '查看详情', exact: true }) });
  await expect(details).toHaveAccessibleName('查看详情');
  await expect(details.locator('img')).toHaveCount(0);
  await expect(details.locator('iframe, object, embed')).toHaveCount(0);
  const received = page.waitForEvent('download');
  await details.getByRole('link', { name: '下载文件', exact: true }).click();
  const downloaded = await received;
  expect(downloaded.suggestedFilename()).toBe('private-browser.pdf');
  expect(await downloadBytes(downloaded)).toEqual(bytes);
  await details.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expectReleasedBlobs(page);
});
