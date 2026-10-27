import { expect } from '@playwright/test';
import { png } from '../test/support/png.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';
import { privateDownload, readyUpload } from '../test/support/admin-assets-browser.ts';

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
