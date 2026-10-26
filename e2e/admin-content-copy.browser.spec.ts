import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
  waitForApiJson,
} from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({ id: z.uuid(), data: z.record(z.string(), z.unknown()) });

test('translated documents copy each unique locale slug into a new real document while preserving the source', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('English source title');
  await page.getByRole('textbox', { name: /^slug/ }).fill('source-english-slug');
  const creating = waitForApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const source = await creating;
  await expect(page).toHaveURL(
    new URL(`/dashboard/collections/articles/${source.id}?locale=en`, page.url()).href,
  );
  await page.getByLabel('内容语言', { exact: true }).selectOption('zh-CN');
  await expect(page).toHaveURL(
    new URL(`/dashboard/collections/articles/${source.id}?locale=zh-CN`, page.url()).href,
  );
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('');
  await page.getByRole('textbox', { name: /^title/ }).fill('中文源标题');
  await page.getByRole('textbox', { name: /^slug/ }).fill('source-chinese-slug');
  const saving = waitForApi(page, 'PATCH', `/v1/collections/articles/documents/${source.id}`);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制文档', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制文档', exact: true });
  await dialog.getByRole('textbox', { name: /^slug/ }).fill('copy-chinese-slug');
  await dialog.getByLabel('副本语言', { exact: true }).selectOption('en');
  await dialog.getByRole('textbox', { name: /^slug/ }).fill('copy-english-slug');
  const copying = waitForApiJson(
    page,
    { method: 'POST', path: `/v1/collections/articles/documents/${source.id}/copies`, status: 201 },
    documentSchema,
  );
  await dialog.getByRole('button', { name: '复制文档', exact: true }).click();
  const copied = await copying;
  expect(copied.id).not.toBe(source.id);
  await expect(page).toHaveURL(
    new URL(`/dashboard/collections/articles/${copied.id}?locale=zh-CN`, page.url()).href,
  );
  for (const locale of ['en', 'zh-CN']) {
    const copyRead = await bffRequest(page, {
      method: 'GET',
      path: `/v1/collections/articles/documents/${copied.id}?locale=${locale}&fallback=[]&depth=0`,
    });
    expect(copyRead.status()).toBe(200);
    const originalRead = await bffRequest(page, {
      method: 'GET',
      path: `/v1/collections/articles/documents/${source.id}?locale=${locale}&fallback=[]&depth=0`,
    });
    expect(originalRead.status()).toBe(200);
    const expectedTitle = locale === 'en' ? 'English source title' : '中文源标题';
    expect(documentSchema.parse(await copyRead.json()).data).toMatchObject({
      title: expectedTitle,
      slug: locale === 'en' ? 'copy-english-slug' : 'copy-chinese-slug',
    });
    expect(documentSchema.parse(await originalRead.json()).data).toMatchObject({
      title: expectedTitle,
      slug: locale === 'en' ? 'source-english-slug' : 'source-chinese-slug',
    });
  }
});
