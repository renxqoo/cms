import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';

async function prepare(page: Page, path: string, data: unknown) {
  const response = await page.request.post(`/api/cms${path}`, {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response;
}

async function loginOwner(page: Page) {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('rediscovers an uploaded session and confirms server cancellation after a narrow-screen reload', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginOwner(page);
  const response = await prepare(page, '/v1/collections/media/uploads', {
    purpose: 'create',
    filename: 'Recoverable session.pdf',
    mimeType: 'application/pdf',
    bytes: 36,
  });
  const upload = z.object({ id: z.uuid() }).parse(await response.json());
  await page.goto('/dashboard/jobs?collection=media&tab=uploads&purpose=create');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: 'Recoverable session.pdf' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: '详情', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '上传会话 · 详情', exact: true });
  await expect(dialog.getByText('36', { exact: true })).toBeVisible();
  const cancellation = waitForApi(page, 'DELETE', `/v1/collections/media/uploads/${upload.id}`);
  await dialog.getByRole('button', { name: '取消上传会话', exact: true }).click();
  expect((await cancellation).status()).toBe(204);
  await expect(
    dialog.getByText('已确认取消请求，请重新读取最新状态。', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: 'Recoverable session.pdf' })
      .getByText('已取消', { exact: true }),
  ).toBeVisible();
});
