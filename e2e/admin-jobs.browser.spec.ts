import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import {
  test,
  loginManagement,
  waitForApi,
  bffRequest,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';
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
