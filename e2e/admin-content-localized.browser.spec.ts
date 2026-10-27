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

async function publish(page: Page, path: string) {
  await page.getByRole('button', { name: '发布', exact: true }).click();
  const response = waitForApi(page, 'POST', `${path}/publications`);
  await page
    .getByRole('dialog', { name: '确认操作', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
}

test('independently publishes and withdraws a translation while keeping the other language snapshot intact', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('English public story');
  await page.getByRole('textbox', { name: /^slug/ }).fill('localized-publication-en');
  const creating = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await creating.read();
  await expect(page).toHaveURL(new RegExp(`/articles/${created.id}\\?locale=en$`));
  const path = `/v1/collections/articles/documents/${created.id}`;
  await publish(page, path);
  const unpublished = await bffRequest(page, {
    method: 'GET',
    path: `${path}?mode=published&locale=zh-CN&fallback=[]&depth=0`,
  });
  expect(unpublished.status()).toBe(404);
  await page.getByLabel('内容语言', { exact: true }).selectOption('zh-CN');
  await expect(page).toHaveURL(/locale=zh-CN$/);
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('');
  await page.getByRole('textbox', { name: /^title/ }).fill('中文独立发布');
  await page.getByRole('textbox', { name: /^slug/ }).fill('localized-publication-zh');
  const saving = waitForApi(page, 'PATCH', path);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await publish(page, path);
  for (const [locale, title] of [
    ['en', 'English public story'],
    ['zh-CN', '中文独立发布'],
  ]) {
    const response = await bffRequest(page, {
      method: 'GET',
      path: `${path}?mode=published&locale=${locale}&fallback=[]&depth=0`,
    });
    expect(response.status()).toBe(200);
    expect(documentSchema.parse(await response.json()).data['title']).toBe(title);
  }
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '取消发布', exact: true }).click();
  const withdrawing = waitForApi(page, 'DELETE', `${path}/publication`);
  await page
    .getByRole('dialog', { name: '确认操作', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  expect((await withdrawing).status()).toBe(200);
  const english = await bffRequest(page, {
    method: 'GET',
    path: `${path}?mode=published&locale=en&fallback=[]&depth=0`,
  });
  expect(english.status()).toBe(200);
  expect(documentSchema.parse(await english.json()).data['title']).toBe('English public story');
  const chinese = await bffRequest(page, {
    method: 'GET',
    path: `${path}?mode=published&locale=zh-CN&fallback=[]&depth=0`,
  });
  expect(chinese.status()).toBe(404);
});
