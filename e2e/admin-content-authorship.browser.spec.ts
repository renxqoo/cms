import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  captureApiJson,
  loginManagement,
  test,
} from '../test/support/admin-browser-management.ts';

const author = z.object({ id: z.uuid(), displayName: z.string().nullable() });
const document = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  createdBy: author,
  updatedBy: author,
});

test('tracks the signed-in author through the real create and edit flow and displays safe identity metadata', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const identity = await bffRequest(page, { method: 'GET', path: '/v1/me' });
  expect(identity.status()).toBe(200);
  const actor = author.parse(await identity.json());
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Authorship journey');
  await page.getByRole('textbox', { name: /^slug/ }).fill('authorship-journey');
  const creating = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    document,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await creating.read();
  expect(created.createdBy).toEqual(actor);
  expect(created.updatedBy).toEqual(actor);
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/articles/${created.id}\\?locale=en$`),
  );
  const metadata = page.getByRole('heading', { name: '作者追踪', exact: true }).locator('..');
  await expect(metadata.getByText('创建者', { exact: true })).toBeVisible();
  await expect(metadata.getByText(actor.id, { exact: true })).toHaveCount(2);
  await page.getByRole('textbox', { name: /^title/ }).fill('Authorship edited');
  const saving = await captureApiJson(
    page,
    { method: 'PATCH', path: `/v1/collections/articles/documents/${created.id}`, status: 200 },
    document,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const updated = await saving.read();
  expect(updated.createdBy).toEqual(actor);
  expect(updated.updatedBy).toEqual(actor);
  await expect(metadata.getByText(actor.id, { exact: true })).toHaveCount(2);
});
