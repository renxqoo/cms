import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  data: z.record(z.string(), z.unknown()),
});
const moveSchema = z.object({ rows: z.array(documentSchema) });

async function createTag(page: Page, input: { title: string; slug: string; parent?: string }) {
  await page.goto('/dashboard/collections/tags/new?locale=en');
  await page.getByRole('textbox', { name: /^Title/ }).fill(input.title);
  await page.getByRole('textbox', { name: /^Slug/ }).fill(input.slug);
  if (input.parent) {
    await page.getByRole('button', { name: '选择父级', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择父级', exact: true });
    await dialog.getByRole('button', { name: '选择已有内容', exact: true }).click();
    await page.getByRole('option', { name: `Tags: ${input.parent}`, exact: true }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: '完成', exact: true }).click();
  }
  const saving = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/tags/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const result = await saving.read();
  await expect(page).toHaveURL(new RegExp(`/dashboard/collections/tags/${result.id}\\?locale=en$`));
  await expect(page.getByRole('textbox', { name: /^Title/ })).toHaveValue(input.title);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  return result;
}

test('creates nested tags through the real parent picker, moves a child to root and assigns multiple tags to an article', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const root = await createTag(page, { title: 'Root tag', slug: 'root-tag' });
  expect(root.data['slugPath']).toBe('root-tag');
  const child = await createTag(page, {
    title: 'Child tag',
    slug: 'child-tag',
    parent: 'Root tag',
  });
  expect(child.data['parent']).toEqual({ collection: 'tags', id: root.id });
  expect(child.data['slugPath']).toBe('root-tag/child-tag');
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await page.getByRole('button', { name: '浏览层级树', exact: true }).click();
  const tree = page.getByRole('region', { name: '浏览层级树', exact: true });
  await tree.getByRole('button', { name: '展开子项: Root tag', exact: true }).click();
  const childButton = tree.getByRole('button', { name: 'Child tag', exact: true });
  await expect(childButton).toBeVisible();
  await childButton.locator('..').getByRole('button', { name: '移动', exact: true }).click();
  const moving = page.getByRole('dialog', { name: '移动所选项目', exact: true });
  await moving.getByRole('button', { name: '设为根级', exact: true }).click();
  const savingMove = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/tags/hierarchy/moves', status: 200 },
    moveSchema,
  );
  await moving.getByRole('button', { name: '移动项目', exact: true }).click();
  expect((await savingMove.read()).rows[0]?.data['slugPath']).toBe('child-tag');
  await expect(moving).toHaveCount(0);
  const stored = await bffRequest(page, {
    method: 'GET',
    path: `/v1/collections/tags/documents/${child.id}?locale=en&fallback=[]&depth=0`,
  });
  expect(stored.status()).toBe(200);
  expect(documentSchema.parse(await stored.json()).data).toMatchObject({
    parent: null,
    slugPath: 'child-tag',
  });
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Story with nested taxonomy');
  await page.getByRole('textbox', { name: /^slug/ }).fill('hierarchy-tagged-story');
  const tags = page.getByRole('group', { name: 'Tags', exact: true });
  await tags.getByRole('button', { name: '选择已有内容', exact: true }).click();
  await page.getByRole('option', { name: 'Tags: Root tag', exact: true }).click();
  await page.getByRole('option', { name: 'Tags: Child tag', exact: true }).click();
  await page.keyboard.press('Escape');
  const savingArticle = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await savingArticle.read()).data['tags']).toEqual([
    { collection: 'tags', id: root.id },
    { collection: 'tags', id: child.id },
  ]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
