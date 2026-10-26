import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
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
  const saving = waitForApi(page, 'POST', '/v1/collections/articles/documents');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const response = await saving;
  expect(response.status()).toBe(201);
  const created = documentSchema.parse(await response.json());
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

test('real collection editing preserves published snapshots, compares history, and restores the complete version', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const created = await createInUi(page, 'browser-content-story');
  const path = `/v1/collections/articles/documents/${created.id}`;
  await confirmAction(page, { label: '发布', method: 'POST', path: `${path}/publications` });
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: /^title/ }).fill('Private draft revision');
  const saving = waitForApi(page, 'PATCH', path);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const savedResponse = await saving;
  expect(savedResponse.status()).toBe(200);
  const saved = documentSchema.parse(await savedResponse.json());
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const publishedResponse = await bffRequest(page, {
    method: 'GET',
    path: `${path}?mode=published&locale=en&fallback=[]&depth=0`,
  });
  expect(publishedResponse.status()).toBe(200);
  expect(documentSchema.parse(await publishedResponse.json()).data['title']).toBe(
    'Published story',
  );
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
