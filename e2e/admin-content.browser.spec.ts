import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
  waitForApiJson,
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
  const saving = waitForApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await saving;
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

async function exerciseRichText(page: Page) {
  const body = page.getByRole('textbox', { name: 'body', exact: true });
  await body.fill('Lexical story');
  await page.getByRole('button', { name: '标题', exact: true }).click();
  await expect(body.getByRole('heading', { name: 'Lexical story' })).toBeVisible();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(body.getByRole('heading')).toHaveCount(0);
  await expect(body).toHaveText('Lexical story');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(body.getByRole('heading', { name: 'Lexical story' })).toBeVisible();
  const list = page.getByRole('button', { name: '列表', exact: true });
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(body.getByRole('listitem')).toHaveText('Lexical story');
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'false');
  await expect(body.getByRole('list')).toHaveCount(0);
  await page.getByRole('button', { name: '标题', exact: true }).click();
}

async function verifyEditorLayout(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const toolbar = page.getByRole('toolbar', { name: '富文本', exact: true });
  await expect(toolbar).toBeVisible();
  const sizes = await toolbar.evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.width);
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  await page.screenshot({
    path: test.info().outputPath(`content-editor-${width}.png`),
    fullPage: true,
  });
}

test('regression: content creation captures its response before navigation and preserves Lexical editing at desktop and narrow widths', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  const title = page.getByRole('textbox', { name: /^title/ });
  await title.fill('Editor controls');
  await page.getByRole('textbox', { name: /^slug/ }).fill('browser-editor-controls');
  await page.getByRole('textbox', { name: /^summary/ }).fill('Summary');
  await expect(title.locator('..').getByRole('button', { name: '清空', exact: true })).toHaveCount(
    0,
  );
  await exerciseRichText(page);
  for (const width of [1440, 390]) await verifyEditorLayout(page, width);
  const saving = waitForApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await saving;
  expect(created.data['body']).toEqual({
    version: 1,
    children: [{ type: 'heading', children: [{ type: 'text', text: 'Lexical story' }] }],
  });
  await expect(page).toHaveURL(new RegExp(`/articles/${created.id}\\?locale=en$`));
  await page.reload();
  await expect(
    page
      .getByRole('textbox', { name: 'body', exact: true })
      .getByRole('heading', { name: 'Lexical story' }),
  ).toBeVisible();
});

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
