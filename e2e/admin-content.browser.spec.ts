import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
});

async function createInUi(page: Page, slug: string) {
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Published story');
  await page.getByRole('textbox', { name: /^slug/ }).fill(slug);
  const saving = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await saving.read();
  await expect(page).toHaveURL(
    new URL(`/dashboard/collections/articles/${created.id}?locale=en`, page.url()).href,
  );
  return created;
}

async function confirmAction(page: Page, input: { label: string; method: string; path: string }) {
  await page.getByRole('button', { name: input.label, exact: true }).click();
  const response = waitForApi(page, input.method, input.path);
  await page
    .getByRole('dialog', { name: '确认操作', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  expect((await response).status()).toBe(200);
}

async function verifyHistoryLayout(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const header = page
    .locator('header')
    .filter({ has: page.getByRole('heading', { level: 1, name: 'Articles', exact: true }) });
  await expect(header.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  const bounds = await header.boundingBox();
  expect(bounds?.height).toBeLessThan(200);
  await expect(header).not.toContainText('修订');
  await page.screenshot({
    path: test.info().outputPath(`detail-header-${width}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  const trigger = header.getByRole('button', { name: '历史版本', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '历史版本', exact: true });
  await expect(dialog.getByRole('button', { name: '查看版本', exact: true }).first()).toBeVisible();
  const sizes = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    height: window.innerHeight,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.width);
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.top).toBeGreaterThanOrEqual(15);
  expect(sizes.bottom).toBeLessThanOrEqual(sizes.height - 15);
  await page.screenshot({
    path: test.info().outputPath(`history-dialog-${width}.png`),
    animations: 'disabled',
  });
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

test('regression: restored history refreshes the editor while preserving published snapshots', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const created = await createInUi(page, 'browser-content-story');
  for (const width of [1440, 768, 390]) await verifyHistoryLayout(page, width);
  const path = `/v1/collections/articles/documents/${created.id}`;
  await confirmAction(page, { label: '发布', method: 'POST', path: `${path}/publications` });
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: /^title/ }).fill('Private draft revision');
  const saving = await captureApiJson(page, { method: 'PATCH', path, status: 200 }, documentSchema);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await saving.read();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const publishedResponse = await bffRequest(page, {
    method: 'GET',
    path: `${path}?mode=published&locale=en&fallback=[]&depth=0`,
  });
  expect(publishedResponse.status()).toBe(200);
  expect(documentSchema.parse(await publishedResponse.json()).data['title']).toBe(
    'Published story',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '历史版本', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '历史版本', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看版本', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '版本', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await page.getByLabel('比较起始版本', { exact: true }).selectOption(created.versionId);
  await page.getByLabel('比较目标版本', { exact: true }).selectOption(saved.versionId);
  const comparison = waitForApi(page, 'GET', `${path}/version-diff`);
  await page.getByRole('button', { name: '比较版本', exact: true }).click();
  expect((await comparison).status()).toBe(200);
  await expect(page.locator('pre').filter({ hasText: 'Private draft revision' })).toContainText(
    'Published story',
  );
  await page
    .getByText(/^修订 1 ·/)
    .locator('..')
    .getByRole('button', { name: '恢复此版本', exact: true })
    .click();
  const restoring = waitForApi(page, 'POST', `${path}/restorations`);
  const dialog = page.getByRole('dialog', { name: '恢复此版本', exact: true });
  await expect(dialog).toContainText('所有语言');
  await dialog.getByRole('button', { name: '确认操作', exact: true }).click();
  expect((await restoring).status()).toBe(201);
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('Published story');
});
