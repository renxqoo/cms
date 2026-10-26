import { expect } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  browserDocument,
  contentRequest,
  grantContentOperations,
  waitForContent,
} from '../test/support/admin-content-browser.ts';

test('editing disables language fallback and restoring history restores the entire multilingual snapshot', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, {
    collection: 'articles',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.get',
      'documents.create',
      'documents.update',
      'versions.list',
      'versions.get',
      'versions.restore',
    ],
  });
  const response = await contentRequest(page, {
    method: 'POST',
    path: '/v1/collections/articles/documents',
    idempotent: true,
    data: { locale: 'en', data: { title: 'Historical English', slug: 'historical-en' } },
  });
  expect(response.status()).toBe(201);
  const created = browserDocument.parse(await response.json());
  const path = `/v1/collections/articles/documents/${created.id}`;
  await page.goto(`/dashboard/collections/articles/${created.id}?locale=zh-CN`);
  await expect(page.getByLabel(/^title/).first()).toHaveValue('');
  await expect(page.getByLabel(/^slug/).first()).toHaveValue('');
  await page
    .getByLabel(/^title/)
    .first()
    .fill('历史中文');
  await page.getByLabel(/^slug/).first().fill('historical-zh');
  let saving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const historicalResponse = await saving;
  expect(historicalResponse.status()).toBe(200);
  const historical = browserDocument.parse(await historicalResponse.json());
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: '内容语言', exact: true }).selectOption('en');
  await expect(page.getByLabel(/^title/).first()).toHaveValue('Historical English');
  await page
    .getByLabel(/^title/)
    .first()
    .fill('Current English');
  saving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: '内容语言', exact: true }).selectOption('zh-CN');
  await expect(page.getByLabel(/^title/).first()).toHaveValue('历史中文');
  await page
    .getByLabel(/^title/)
    .first()
    .fill('当前中文');
  saving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page
    .getByRole('combobox', { name: '版本', exact: true })
    .selectOption(historical.versionId);
  await expect(page.getByRole('button', { name: '恢复完整快照', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '恢复完整快照', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '恢复完整快照', exact: true });
  await expect(dialog).toContainText('恢复所有语言的完整历史快照');
  await expect(dialog).toContainText('全部语言');
  const restoring = waitForContent(page, { method: 'POST', path: `${path}/restorations` });
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  const restoredResponse = await restoring;
  expect(restoredResponse.status()).toBe(201);
  const restored = browserDocument.parse(await restoredResponse.json());
  expect(restored.revision).toBeGreaterThan(historical.revision);
  await expect(page.getByLabel(/^title/).first()).toHaveValue('历史中文');
  for (const [locale, title] of [
    ['en', 'Historical English'],
    ['zh-CN', '历史中文'],
  ]) {
    const current = await contentRequest(page, {
      method: 'GET',
      path: `${path}?locale=${locale}&fallback=%5B%5D&depth=0&mode=editing`,
    });
    expect(current.status()).toBe(200);
    expect(browserDocument.parse(await current.json()).data['title']).toBe(title);
  }
});
