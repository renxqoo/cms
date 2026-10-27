import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  loginManagement,
  test,
  waitForApi,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';

test('combines filters and sorts, persists a shared view across reload and applies then deletes the real preset', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Editorial bulletin');
  await page.getByRole('textbox', { name: /^slug/ }).fill('query-preset-bulletin');
  const creating = waitForApi(page, 'POST', '/v1/collections/articles/documents');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await creating).status()).toBe(201);
  await page.goto('/dashboard/collections/articles?locale=en');
  await expect(page.getByRole('button', { name: 'Editorial bulletin', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('button', { name: '添加条件', exact: true }).click();
  await page.getByRole('combobox', { name: '筛选字段', exact: true }).selectOption('title');
  await page.getByRole('combobox', { name: '比较方式', exact: true }).selectOption('like');
  await page.getByRole('textbox', { name: '筛选值', exact: true }).fill('Editorial');
  const filtering = waitForApi(page, 'GET', '/v1/collections/articles/documents');
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  expect((await filtering).status()).toBe(200);
  await page.getByRole('button', { name: /^筛选/ }).click();
  await page.getByRole('button', { name: '排序 · 1', exact: true }).click();
  await page.getByRole('button', { name: '添加排序字段', exact: true }).click();
  await page.getByRole('combobox', { name: '排序 1', exact: true }).selectOption('revision');
  await page.getByRole('combobox', { name: '排序 2', exact: true }).selectOption('title');
  await page.getByRole('combobox', { name: '比较方式 1', exact: true }).selectOption('desc');
  const sorting = waitForApi(page, 'GET', '/v1/collections/articles/documents');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  expect((await sorting).status()).toBe(200);
  await page.getByRole('button', { name: '排序 · 2', exact: true }).click();
  await page.getByRole('button', { name: '保存的视图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '保存的视图', exact: true });
  await dialog.getByRole('textbox', { name: '视图名称', exact: true }).fill('Editorial view');
  await dialog.getByRole('combobox', { name: '读取视图', exact: true }).selectOption('everyone');
  const saving = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/query-presets', status: 201 },
    z.object({ id: z.uuid(), version: z.number(), shared: z.boolean() }),
  );
  await dialog.getByRole('button', { name: '保存当前视图', exact: true }).click();
  const saved = await saving.read();
  expect(saved.shared).toBe(true);
  await expect(dialog.getByText('Editorial view · 共享给此集合', { exact: true })).toBeVisible();
  await page.reload();
  await page.goto('/dashboard/collections/articles?locale=en');
  await page.getByRole('button', { name: '保存的视图', exact: true }).click();
  await expect(dialog.getByText('Editorial view · 共享给此集合', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '应用视图', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/where=/);
  expect(JSON.parse(new URL(page.url()).searchParams.get('where') ?? 'null')).toEqual({
    field: 'title',
    operator: 'like',
    value: 'Editorial',
  });
  expect(JSON.parse(new URL(page.url()).searchParams.get('sort') ?? 'null')).toEqual([
    { field: 'revision', order: 'desc' },
    { field: 'title', order: 'asc' },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '保存的视图', exact: true }).click();
  await expect(dialog.getByText('Editorial view · 共享给此集合', { exact: true })).toBeVisible();
  const bounds = await dialog.evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.width);
  await dialog.getByRole('button', { name: '删除视图', exact: true }).click();
  const deleting = waitForApi(page, 'DELETE', `/v1/collections/articles/query-presets/${saved.id}`);
  await dialog.getByRole('button', { name: '删除视图 · Editorial view', exact: true }).click();
  expect((await deleting).status()).toBe(204);
  await expect(dialog.getByText('暂无保存的视图。', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存的视图', exact: true })).toBeFocused();
});
