import { expect } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test, waitForApi } from '../test/support/admin-browser-management.ts';

test('persists keyboard and drag collection order across reload through real versioned writes', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const [title, slug] of [
    ['Order first', 'order-first'],
    ['Order second', 'order-second'],
  ] as const) {
    const created = await page.request.post('/api/cms/v1/collections/articles/documents', {
      headers: { origin: new URL(page.url()).origin, 'idempotency-key': crypto.randomUUID() },
      data: { locale: 'en', data: { title, slug } },
    });
    expect(created.status()).toBe(201);
    const document: unknown = await created.json();
    expect(document).toMatchObject({ data: { title } });
  }
  const sort = encodeURIComponent(JSON.stringify([{ field: '_order', order: 'asc' }]));
  const where = encodeURIComponent(
    JSON.stringify({ field: 'title', operator: 'like', value: 'Order' }),
  );
  await page.goto(`/dashboard/collections/articles?locale=en&sort=${sort}&where=${where}`);
  const up = page.getByRole('button', { name: '上移 Order second', exact: true });
  await expect(up).toBeEnabled();
  await up.focus();
  const moving = waitForApi(page, 'POST', '/v1/collections/articles/document-order');
  await page.keyboard.press('Enter');
  expect((await moving).status()).toBe(200);
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Order second');
  await page.reload();
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Order second');
  const source = page.getByRole('button', { name: '拖动调整顺序 Order second', exact: true });
  const target = page.getByRole('button', { name: '拖动调整顺序 Order first', exact: true });
  await expect(source).toBeEnabled();
  const dragging = waitForApi(page, 'POST', '/v1/collections/articles/document-order');
  await source.dragTo(target);
  expect((await dragging).status()).toBe(200);
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Order first');
  await page.reload();
  await expect(page.getByRole('table').getByRole('row').nth(1)).toContainText('Order first');
});
