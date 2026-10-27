import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import {
  test,
  loginManagement,
  bffRequest,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';

async function loginOwner(page: Page) {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('retries a blocked cleanup ledger entry without claiming physical deletion or bypassing retention', async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto('/dashboard/asset-cleanups');
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: '等待清理', exact: true }) });
  await expect(row).toHaveCount(1);
  const objectId = z.uuid().parse(await row.getByRole('cell').first().innerText());
  await row.getByRole('button', { name: '详情', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '资源清理 · 详情', exact: true });
  await expect(dialog.getByText('temporarily_unavailable', { exact: true })).toBeVisible();
  const retry = await captureApiJson(
    page,
    { method: 'POST', path: `/v1/asset-cleanups/${objectId}/retries`, status: 202 },
    z.object({ id: z.uuid(), accepted: z.literal(true) }),
  );
  await dialog.getByRole('button', { name: '请求清理重试', exact: true }).click();
  const receipt = await retry.read();
  expect(receipt.id).toBe(objectId);
  await expect(
    dialog.getByText('已受理重试，尚未确认物理删除，请读取最新账本状态。', { exact: true }),
  ).toBeVisible();
  const current = await bffRequest(page, {
    method: 'GET',
    path: `/v1/asset-cleanups/${receipt.id}`,
  });
  expect(current.status()).toBe(200);
  const entry = z
    .object({ blocked: z.boolean(), state: z.string(), retainUntil: z.iso.datetime() })
    .parse(await current.json());
  expect(entry.blocked).toBe(false);
  expect(entry.state).toBe('pending');
  expect(Date.parse(entry.retainUntil)).toBeGreaterThan(Date.now());
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
