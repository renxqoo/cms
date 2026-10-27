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

test('discovers a scheduled publication after refresh and cancels it through the real UI', async ({
  page,
}) => {
  await loginOwner(page);
  const created = await prepare(page, '/v1/collections/articles/documents', {
    dataByLocale: {
      en: { title: 'Scheduled work', slug: 'scheduled-work-en' },
      'zh-CN': { title: '计划发布任务', slug: 'scheduled-work-zh' },
    },
  });
  const document = z
    .object({ id: z.uuid(), revision: z.number(), versionId: z.uuid() })
    .parse(await created.json());
  const accepted = await prepare(
    page,
    `/v1/collections/articles/documents/${document.id}/publication-schedules`,
    {
      revision: document.revision,
      versionId: document.versionId,
      executeAt: new Date(Date.now() + 3600_000).toISOString(),
    },
  );
  expect(accepted.status()).toBe(202);
  const job = z.object({ jobId: z.uuid() }).parse(await accepted.json());
  await page.goto(`/dashboard/jobs?collection=articles&action=publication&jobId=${job.jobId}`);
  const dialog = page.getByRole('dialog', { name: '任务 · 详情', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(document.versionId, { exact: true })).toBeVisible();
  const cancelled = waitForApi(
    page,
    'DELETE',
    `/v1/collections/articles/documents/${document.id}/publication-schedules/${job.jobId}`,
  );
  await dialog.getByRole('button', { name: '取消发布计划', exact: true }).click();
  expect((await cancelled).status()).toBe(204);
  await expect(
    dialog.getByText('已确认取消请求，请重新读取最新状态。', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.goto('/dashboard/jobs?collection=articles&action=publication');
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: job.jobId });
  await expect(row.getByText('已取消', { exact: true })).toBeVisible();
});
