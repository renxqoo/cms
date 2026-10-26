import { expect } from '@playwright/test';
import { z } from 'zod';
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
import { png } from '../test/support/png.ts';

test('Chrome uploads real PNG bytes, cancels a session after sending bytes, retries with a new session and rediscovers the actual sessions in Jobs', async ({
  page,
}) => {
  await observeBlobUrls(page);
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, { collection: 'media', operations: mediaBrowserOperations });
  await page.goto('/dashboard/resources?collection=media');
  await page.getByRole('button', { name: '上传文件', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '上传文件', exact: true });
  const bytes = png([255, 0, 0]);
  let preparing = waitForContent(page, { method: 'POST', path: '/v1/collections/media/uploads' });
  const firstWrite = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      /^\/api\/cms\/v1\/collections\/media\/uploads\/[0-9a-f-]+\/content$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await dialog
    .getByLabel('选择文件', { exact: true })
    .setInputFiles({ name: '浏览器 red.png', mimeType: 'image/png', buffer: bytes });
  let prepared = await preparing;
  expect(prepared.status()).toBe(201);
  const first = z.object({ id: z.uuid() }).parse(await prepared.json());
  const written = await firstWrite;
  expect(written.status()).toBe(200);
  expect(new URL(written.url()).pathname).toBe(
    `/api/cms/v1/collections/media/uploads/${first.id}/content`,
  );
  const cancelling = waitForContent(page, {
    method: 'DELETE',
    path: `/v1/collections/media/uploads/${first.id}`,
  });
  await dialog.getByRole('button', { name: '取消上传', exact: true }).click();
  expect((await cancelling).status()).toBe(204);
  await expect(dialog.getByText('已取消', { exact: true })).toBeVisible();
  preparing = waitForContent(page, { method: 'POST', path: '/v1/collections/media/uploads' });
  const ready = waitForReadyUpload(page);
  await dialog.getByRole('button', { name: '创建新会话重试', exact: true }).click();
  prepared = await preparing;
  expect(prepared.status()).toBe(201);
  const second = z.object({ id: z.uuid() }).parse(await prepared.json());
  expect(second.id).not.toBe(first.id);
  expect(z.object({ id: z.uuid() }).parse(await (await ready).json()).id).toBe(second.id);
  await dialog.getByRole('button', { name: '创建资源文档', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/media/new\\?uploadId=${second.id}$`),
  );
  await page.getByLabel(/^title/).fill('PNG from the browser');
  const creating = waitForContent(page, {
    method: 'POST',
    path: '/v1/collections/media/documents',
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await creating;
  expect(created.status()).toBe(201);
  const document = browserMediaDocument.parse(await created.json());
  expect(document.file.digest).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(document.file).toMatchObject({ mimeType: 'image/png', width: 2, height: 1 });
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/media/${document.id}\\?locale=en$`),
  );
  await page.goto('/dashboard/resources?collection=media');
  await page.getByRole('button', { name: '浏览器 red.png', exact: true }).click();
  const details = page.getByRole('dialog', { name: '查看详情', exact: true });
  const download = page.waitForEvent('download');
  await details.getByRole('link', { name: '下载文件', exact: true }).click();
  expect(await downloadBytes(await download)).toEqual(bytes);
  await details.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expectReleasedBlobs(page);
  await page.goto('/dashboard/jobs?view=uploads&collection=media');
  await expect(page.getByRole('row').filter({ hasText: first.id })).toContainText('已取消');
  await expect(page.getByRole('row').filter({ hasText: second.id })).toContainText('已附加');
});
