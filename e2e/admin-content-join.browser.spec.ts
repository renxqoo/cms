import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';

test('pages, filters and reorders inverse related articles through authorized SQL and stable CAS writes', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const headers = { origin: new URL(page.url()).origin, 'idempotency-key': crypto.randomUUID() };
  const created = await page.request.post('/api/cms/v1/collections/pages/documents', {
    headers,
    data: { locale: 'en', data: { title: 'Join parent', slug: 'join-parent' } },
  });
  expect(created.status()).toBe(201);
  const parent = z.object({ id: z.uuid() }).parse(await created.json());
  for (const title of ['Join Alpha', 'Join Bravo', 'Join Charlie']) {
    const result = await page.request.post('/api/cms/v1/collections/articles/documents', {
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      data: {
        locale: 'en',
        data: {
          title,
          slug: title.toLowerCase().replaceAll(' ', '-'),
          related: [{ collection: 'pages', id: parent.id }],
        },
      },
    });
    expect(result.status()).toBe(201);
  }
  await page.goto(`/dashboard/collections/pages/${parent.id}?locale=en`);
  const join = page.getByRole('region', { name: 'Related articles', exact: true });
  await expect(join.getByRole('button', { name: 'Join Alpha', exact: true })).toBeVisible();
  await expect(join.getByRole('button', { name: 'Join Bravo', exact: true })).toBeVisible();
  await expect(join.getByRole('button', { name: 'Join Charlie', exact: true })).toHaveCount(0);
  await join.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(join.getByRole('button', { name: 'Join Charlie', exact: true })).toBeVisible();
  await expect(join.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await join.getByRole('button', { name: '上一页', exact: true }).click();
  const up = join.getByRole('button', { name: '上移 Join Bravo', exact: true });
  await expect(up).toBeEnabled();
  await up.focus();
  const orderPath = `/v1/collections/pages/documents/${parent.id}/joins/articles_join/order`;
  const moved = waitForApi(page, 'POST', orderPath);
  await page.keyboard.press('Enter');
  expect((await moved).status()).toBe(200);
  await expect(join.getByRole('table').getByRole('row').nth(1)).toContainText('Join Bravo');
  await page.reload();
  await expect(join.getByRole('table').getByRole('row').nth(1)).toContainText('Join Bravo');
  const source = join.getByRole('button', { name: '拖动调整顺序 Join Bravo', exact: true });
  const target = join.getByRole('button', { name: '拖动调整顺序 Join Alpha', exact: true });
  await expect(source).toBeEnabled();
  const dragging = waitForApi(page, 'POST', orderPath);
  await source.dragTo(target);
  expect((await dragging).status()).toBe(200);
  await expect(join.getByRole('table').getByRole('row').nth(1)).toContainText('Join Alpha');
  await join.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('button', { name: '添加条件', exact: true }).click();
  await page.getByRole('combobox', { name: '筛选字段', exact: true }).selectOption('title');
  await page.getByRole('textbox', { name: '筛选值', exact: true }).fill('Join Alpha');
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(join.getByRole('button', { name: 'Join Bravo', exact: true })).toHaveCount(0);
  await expect(join.getByRole('button', { name: 'Join Alpha', exact: true })).toBeVisible();
  await expect(join).toContainText('总计 1');
});
