import { expect } from '@playwright/test';
import { test, loginManagement, bffRequest } from '../test/support/admin-browser-management.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';

test('keeps the cleanup ledger and collection work inaccessible to an ordinary administrator', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.reader)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/jobs?collection=articles');
  await expect(page.getByText('没有可读取的集合。', { exact: true })).toBeVisible();
  expect(
    (await bffRequest(page, { method: 'GET', path: '/v1/collections/articles/jobs' })).status(),
  ).toBe(403);
  await page.goto('/dashboard/asset-cleanups');
  await expect(
    page.getByText('仅当前有效的超级管理员可读取清理账本。', { exact: true }),
  ).toBeVisible();
  expect((await bffRequest(page, { method: 'GET', path: '/v1/asset-cleanups' })).status()).toBe(
    403,
  );
});
