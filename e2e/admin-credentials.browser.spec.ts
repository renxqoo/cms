import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { collectionListSchema } from '../apps/admin/src/contracts/content.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

const credentialListSchema = z.object({
  rows: z.array(z.object({ id: z.uuid(), name: z.string(), status: z.string() })),
  total: z.number(),
});
const keyCreatedSchema = z.object({
  credential: z.object({
    id: z.uuid(),
    grants: z.array(
      z.object({
        operationId: z.string(),
        scopeKind: z.string(),
        collectionKey: z.string().nullable(),
      }),
    ),
  }),
  apiKey: z.string().min(1),
});

async function loginCredentials(page: Page) {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await page.waitForURL((url) => url.pathname === '/dashboard');
}

test('creates an explicitly scoped API key once, keeps its secret out of rereads and revokes it on a narrow screen', async ({
  page,
}) => {
  await loginCredentials(page);
  await page.goto('/dashboard/account');
  await page.getByRole('link', { name: '个人访问凭据', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/account\/credentials$/);
  await page.setViewportSize({ width: 360, height: 780 });
  const collectionsResponse = await bffRequest(page, { method: 'GET', path: '/v1/collections' });
  expect(collectionsResponse.status()).toBe(200);
  const collections = collectionListSchema.parse(await collectionsResponse.json());
  const articles = collections.rows.find((collection) => collection.key === 'articles');
  if (!articles)
    throw new Error('The credential journey requires the registered articles collection.');
  await page.getByRole('button', { name: '创建 API Key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建 API Key', exact: true });
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('Browser article key');
  await dialog
    .getByRole('checkbox', { name: `${articles.label}: documents.get`, exact: true })
    .check();
  const createdResponse = waitForApi(page, 'POST', '/v1/me/api-keys');
  await dialog.getByRole('button', { name: '创建 API Key', exact: true }).click();
  const created = keyCreatedSchema.parse(await (await createdResponse).json());
  expect(created.credential.grants).toEqual([
    { operationId: 'documents.get', scopeKind: 'collection', collectionKey: 'articles' },
  ]);
  await expect(page.getByRole('textbox', { name: 'API Key 秘密', exact: true })).toHaveValue(
    created.apiKey,
  );
  await page.getByRole('button', { name: '我已保存，关闭', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const reread = await bffRequest(page, {
    method: 'GET',
    path: '/v1/me/credentials?kind=api_key&page=1&pageSize=20',
  });
  const rereadText = await reread.text();
  expect(rereadText).not.toContain(created.apiKey);
  expect(rereadText).not.toContain('refresh_token');
  expect(
    credentialListSchema
      .parse(JSON.parse(rereadText))
      .rows.some((row) => row.id === created.credential.id),
  ).toBe(true);
  const row = page.getByRole('row').filter({ hasText: 'Browser article key' });
  await row.getByRole('button', { name: '撤销 Key', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByRole('button', { name: '撤销 Key', exact: true })).toBeFocused();
  await row.getByRole('button', { name: '撤销 Key', exact: true }).click();
  const revoked = waitForApi(page, 'DELETE', `/v1/me/credentials/${created.credential.id}`);
  await page.getByRole('button', { name: '确认撤销', exact: true }).click();
  expect((await revoked).status()).toBe(204);
  await expect(row.getByText('已撤销', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '撤销 Key', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('keeps English credential controls and validation usable at mobile width', async ({
  page,
}) => {
  await loginCredentials(page);
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const label = 'LongCollectionLabel'.repeat(6);
  await page.route(/\/api\/cms\/v1\/collections(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const data = collectionListSchema.parse(await response.json());
    await route.fulfill({
      response,
      json: {
        ...data,
        rows: data.rows.map((collection) =>
          collection.key === 'articles' ? { ...collection, label } : collection,
        ),
      },
    });
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/dashboard/account/credentials');
  await expect(
    page.getByRole('heading', { name: 'Personal access credentials', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create API key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create API key', exact: true });
  const choice = page.getByRole('checkbox', { name: `${label}: documents.get`, exact: true });
  await expect(choice).toBeVisible();
  await choice.check();
  await expect(choice).toBeChecked();
  const overflowing = await page
    .getByRole('dialog')
    .evaluate((container) =>
      [container, ...container.querySelectorAll('fieldset,div')]
        .filter(
          (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => element.tagName),
    );
  expect(overflowing).toEqual([]);
  await dialog.getByRole('button', { name: 'Create API key', exact: true }).click();
  await expect(
    dialog.getByText('Enter a name with no more than 80 characters.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'OAuth sign-ins', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'API keys', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
