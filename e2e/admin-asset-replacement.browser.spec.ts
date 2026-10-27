import { expect } from '@playwright/test';
import { png } from '../test/support/png.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';
import { privateDownload, readyUpload, seedMedia } from '../test/support/admin-assets-browser.ts';

test('regression: replacing a file has an isolated admission window and keeps historical bytes downloadable', async ({
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
