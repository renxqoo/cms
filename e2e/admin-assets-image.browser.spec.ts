import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  contentRequest,
  grantContentOperations,
  waitForContent,
} from '../test/support/admin-content-browser.ts';
import {
  browserMediaDocument,
  createReadyMedia,
  downloadBytes,
  expectReleasedBlobs,
  mediaBrowserOperations,
  observeBlobUrls,
} from '../test/support/admin-asset-browser.ts';
import { png } from '../test/support/png.ts';

test('image processing holds the document channel until the real job and reread finish, preserves a local draft and applies pixel crop to a downloadable variant', async ({
  page,
}) => {
  await observeBlobUrls(page);
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, {
    collection: 'media',
    operations: [...mediaBrowserOperations, 'assets.reprocess'],
  });
  const original = png([255, 100, 0]);
  const prepared = await createReadyMedia(page, {
    bytes: original,
    filename: 'browser-image.png',
    mimeType: 'image/png',
    title: 'Image before processing',
  });
  const { document } = prepared;
  await page.goto(`/dashboard/collections/media/${document.id}?locale=en`);
  await page.getByLabel(/^title/).fill('Local draft retained during processing');
  await page.getByRole('button', { name: '重新处理图片', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '图片处理', exact: true });
  await dialog.getByLabel('裁剪宽度', { exact: true }).fill('0.5');
  await dialog.getByLabel('焦点 X', { exact: true }).fill('0.25');
  await dialog.getByLabel('焦点 Y', { exact: true }).fill('0.75');
  await dialog.getByRole('button', { name: '应用裁剪与焦点', exact: true }).click();
  await dialog.getByLabel('变体名称', { exact: true }).fill('small');
  await dialog.getByLabel('宽度', { exact: true }).fill('2');
  await dialog.getByLabel('高度', { exact: true }).fill('2');
  await dialog.getByLabel('格式', { exact: true }).selectOption('png');
  await dialog.getByLabel('质量', { exact: true }).fill('90');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: test.info().outputPath('image-recipe-1440-zh-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const path = `/v1/collections/media/documents/${document.id}`;
  const processing = waitForContent(page, { method: 'POST', path: `${path}/file-processings` });
  const completed = page.waitForResponse(
    async (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.startsWith('/api/cms/v1/collections/media/jobs/') &&
      response.status() === 200 &&
      z.object({ status: z.string() }).parse(await response.json()).status === 'succeeded',
  );
  let releaseJob: (() => void) | undefined;
  let reachedJob: (() => void) | undefined;
  const heldJob = new Promise<void>((resolve) => {
    releaseJob = resolve;
  });
  const terminalJobRead = new Promise<void>((resolve) => {
    reachedJob = resolve;
  });
  const jobRoute = '**/api/cms/v1/collections/media/jobs/*';
  await page.route(jobRoute, async (route) => {
    const upstream = await route.fetch();
    if (
      upstream.status() === 200 &&
      z.object({ status: z.string() }).parse(await upstream.json()).status === 'succeeded'
    ) {
      reachedJob?.();
      await heldJob;
    }
    await route.fulfill({ response: upstream });
  });
  try {
    await dialog.getByRole('button', { name: '执行图片处理', exact: true }).click();
    const accepted = await processing;
    expect(accepted.status()).toBe(202);
    expect(accepted.request().postDataJSON()).toMatchObject({
      revision: document.revision,
      recipe: {
        crop: { left: 0, top: 0, width: 1, height: 1 },
        focalPoint: { x: 0.25, y: 0.75 },
        variants: [{ name: 'small', width: 2, height: 2, format: 'png', quality: 90 }],
      },
    });
    await terminalJobRead;
    await expect(
      page.getByRole('button', { name: '保存', exact: true, includeHidden: true }),
    ).toBeDisabled();
    releaseJob?.();
    await completed;
  } finally {
    releaseJob?.();
    await page.unroute(jobRoute);
  }
  await expect(dialog.getByRole('button', { name: '关闭', exact: true }).last()).toBeEnabled();
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.getByLabel(/^title/)).toHaveValue('Local draft retained during processing');
  const currentResponse = await contentRequest(page, {
    method: 'GET',
    path: `${path}?locale=en&fallback=%5B%5D&depth=0&mode=editing`,
  });
  expect(currentResponse.status()).toBe(200);
  const current = browserMediaDocument.parse(await currentResponse.json());
  expect(current.revision).toBeGreaterThan(document.revision);
  expect(current.file.recipe).toMatchObject({
    crop: { left: 0, top: 0, width: 1, height: 1 },
    focalPoint: { x: 0.25, y: 0.75 },
  });
  expect(current.file.objects.find((object) => object.name === 'small')).toMatchObject({
    width: 2,
    height: 2,
  });
  const saving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await saving;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).toMatchObject({
    revision: current.revision,
    data: { title: 'Local draft retained during processing' },
  });
  const persisted = browserMediaDocument.parse(await saved.json());
  await expect(page.getByText(new RegExp(`^修订号: ${persisted.revision} ·`))).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  const originalDownload = await contentRequest(page, {
    method: 'GET',
    path: `${path}/file?mode=editing`,
  });
  expect(originalDownload.status()).toBe(200);
  expect(await originalDownload.body()).toEqual(original);
  await page.getByRole('link', { name: '资源管理', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/resources$/);
  await expect(page.getByRole('heading', { name: '离开未保存的编辑？', exact: true })).toHaveCount(
    0,
  );
  await expectReleasedBlobs(page);
  await page.getByRole('button', { name: 'browser-image.png', exact: true }).click();
  const details = page.getByRole('dialog', { name: '查看详情', exact: true });
  await details.getByRole('combobox', { name: '图片变体', exact: true }).selectOption('small');
  const downloaded = page.waitForEvent('download');
  await details.getByRole('link', { name: '下载文件', exact: true }).click();
  const bytes = await downloadBytes(await downloaded);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes.readUInt32BE(16)).toBe(2);
  expect(bytes.readUInt32BE(20)).toBe(2);
  await details.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expectReleasedBlobs(page);
});
