import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';

test('groups relationship values with safe labels and independent document pages and restores saved grouping', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const headers = { origin: new URL(page.url()).origin };
  const tags = [];
  for (const title of ['Grouping Red', 'Grouping Blue']) {
    const result = await page.request.post('/api/cms/v1/collections/tags/documents', {
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      data: { locale: 'en', data: { title, slug: title.toLowerCase().replaceAll(' ', '-') } },
    });
    expect(result.status()).toBe(201);
    tags.push(z.object({ id: z.uuid() }).parse(await result.json()).id);
  }
  for (const [title, tag] of [
    ['Grouping Alpha', tags[0]],
    ['Grouping Bravo', tags[0]],
    ['Grouping Charlie', tags[1]],
  ]) {
    const result = await page.request.post('/api/cms/v1/collections/articles/documents', {
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      data: {
        locale: 'en',
        data: {
          title,
          slug: title?.toLowerCase().replaceAll(' ', '-'),
          tags: [{ collection: 'tags', id: tag }],
        },
      },
    });
    expect(result.status()).toBe(201);
  }
  await page.goto('/dashboard/collections/articles?locale=en&groupPageSize=1');
  const grouping = waitForApi(page, 'GET', '/v1/collections/articles/document-groups');
  await page.getByLabel('分组字段', { exact: true }).selectOption('tags');
  expect((await grouping).status()).toBe(200);
  const groupedURL = new URL(page.url());
  groupedURL.searchParams.set('groupPageSize', '1');
  await page.goto(groupedURL.toString());
  const red = page.getByRole('button', { name: '收起分组: Grouping Red', exact: true });
  await expect(red).toBeVisible();
  const card = red.locator('xpath=ancestor::*[@data-slot="card"]');
  await expect(card.getByRole('button', { name: 'Grouping Alpha', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Grouping Bravo', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Grouping Bravo', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grouping Charlie', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存的视图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '保存的视图', exact: true });
  await dialog.getByRole('textbox', { name: '视图名称', exact: true }).fill('Grouped tags');
  const saved = waitForApi(page, 'POST', '/v1/collections/articles/query-presets');
  await dialog.getByRole('button', { name: '保存当前视图', exact: true }).click();
  expect((await saved).status()).toBe(201);
  await page.goto('/dashboard/collections/articles?locale=en');
  await page.getByRole('button', { name: '保存的视图', exact: true }).click();
  await expect(dialog.getByText('Grouped tags · 私有', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '应用视图', exact: true }).click();
  await expect(
    page.getByRole('button', { name: '收起分组: Grouping Red', exact: true }),
  ).toBeVisible();
  expect(JSON.parse(new URL(page.url()).searchParams.get('groupBy') ?? 'null')).toEqual({
    field: 'tags',
    order: 'asc',
  });
});
