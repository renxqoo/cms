import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { png } from '../test/support/png.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';
import { privateDownload, seedMedia } from '../test/support/admin-assets-browser.ts';

test('automatically saves uploaded PNG bytes to resources without a manual save or footer actions', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/resources');
  await expect(page.getByRole('dialog', { name: '上传文件', exact: true })).toHaveCount(0);
  const upload = page.getByRole('button', { name: '上传文件', exact: true });
  await upload.click();
  const dialog = page.getByRole('dialog', { name: '上传文件', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '查找上传会话', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(upload).toBeFocused();
  await upload.click();
  const bytes = png([201, 33, 44]);
  const ready = readyUpload(page);
  const created = waitForApi(page, 'POST', '/v1/collections/media/documents');
  await page
    .getByLabel('选择文件', { exact: true })
    .setInputFiles({ name: 'browser-source.png', mimeType: 'image/png', buffer: bytes });
  await ready;
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await upload.click();
  expect((await created).status()).toBe(201);
  await expect(page.getByText('已保存到资源库', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const row = page.getByRole('row').filter({ hasText: 'browser-source.png' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '打开文档', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/collections\/media\/[0-9a-f-]+$/);
  await privateDownload(page, bytes);
  await page.reload();
  await expect(page.getByLabel(/^title/)).toHaveValue('browser-source.png');
});

test('replaces a file against its revision and keeps the original historical bytes downloadable', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const original = png([12, 34, 56]);
  const next = png([99, 87, 65]);
  const target = await seedMedia(page, 'before-replace.png', original);
  await page.goto(`/dashboard/collections/media/${target.id}`);
  await page.getByRole('button', { name: '替换文件', exact: true }).click();
  const ready = readyUpload(page);
  await page
    .getByLabel('选择文件', { exact: true })
    .setInputFiles({ name: 'after-replace.png', mimeType: 'image/png', buffer: next });
  await ready;
  await page.getByRole('button', { name: '附加到文档', exact: true }).click({ trial: true });
  await expect(
    page.getByText('文件处理完成，保存文档后才会附加此文件。', { exact: true }),
  ).toBeVisible();
  const replaced = waitForApi(page, 'PATCH', `/v1/collections/media/documents/${target.id}`);
  await page.getByRole('button', { name: '附加到文档', exact: true }).click();
  expect((await replaced).status()).toBe(200);
  await expect(page.getByRole('link', { name: '下载原件', exact: true })).toHaveAttribute(
    'download',
    'after-replace.png',
  );
  await privateDownload(page, next);
  const history = await page.request.get(
    `/api/cms/v1/collections/media/documents/${target.id}/file?versionId=${target.versionId}`,
  );
  expect(history.status()).toBe(200);
  expect(new Uint8Array(await history.body())).toEqual(new Uint8Array(original));
});

function readyUpload(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      /^\/api\/cms\/v1\/collections\/media\/uploads\/[0-9a-f-]+$/.test(
        new URL(response.url()).pathname,
      ) &&
      response.status() === 200,
  );
}
