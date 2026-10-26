import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  contentRequest,
  grantContentOperations,
  waitForContent,
} from '../test/support/admin-content-browser.ts';
import { createReadyUpload, mediaBrowserOperations } from '../test/support/admin-asset-browser.ts';
import {
  markHistoricalCleanupFailure,
  readCleanupFixtureObject,
} from '../test/support/admin-cleanup-fixture.ts';
import { png } from '../test/support/png.ts';

test('cleanup retry acknowledges a real retained object and changes only the selected isolated realm ledger', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, { collection: 'media', operations: mediaBrowserOperations });
  const upload = await createReadyUpload(page, {
    bytes: png([100, 100, 255]),
    filename: 'retained-cleanup.png',
    mimeType: 'image/png',
  });
  const cancelled = await contentRequest(page, {
    method: 'DELETE',
    path: `/v1/collections/media/uploads/${upload.uploadId}`,
  });
  expect(cancelled.status()).toBe(204);
  const response = await contentRequest(page, {
    method: 'GET',
    path: '/v1/asset-cleanups?blocked=false&pageSize=100',
  });
  expect(response.status()).toBe(200);
  const { rows } = z
    .object({
      rows: z.array(
        z.object({ id: z.uuid(), blocked: z.boolean(), retainUntil: z.iso.datetime() }),
      ),
    })
    .parse(await response.json());
  expect(rows.length).toBeGreaterThanOrEqual(2);
  const [entry, other] = rows;
  if (!entry || !other)
    throw new Error('The real image upload must expose its original and variant cleanup ledger.');
  expect(Date.parse(entry.retainUntil)).toBeGreaterThan(Date.now());
  const target = {
    project: test.info().project.name,
    id: entry.id,
    visibleIds: rows.map((row) => row.id),
  };
  await expect(
    markHistoricalCleanupFailure({
      ...target,
      project: target.project === 'development' ? 'production' : 'development',
    }),
  ).rejects.toThrow('exactly one unchanged cleanup object');
  const before = await markHistoricalCleanupFailure(target);
  expect(before.blocked).toBe(true);
  expect(before.attempts).toBe(1);
  expect(Number(before.bytes)).toBeGreaterThan(0);
  const unaffected = await contentRequest(page, {
    method: 'GET',
    path: `/v1/asset-cleanups/${other.id}`,
  });
  expect(unaffected.status()).toBe(200);
  expect(await unaffected.json()).toMatchObject({ id: other.id, blocked: false });
  await page.goto('/dashboard/asset-cleanups');
  await page.getByRole('button', { name: entry.id, exact: true }).click();
  const drawer = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('heading', { name: '查看详情', exact: true }) });
  await expect(drawer).toHaveAccessibleName('查看详情');
  await expect(drawer).toContainText(entry.id);
  await drawer.getByRole('button', { name: '请求重试清理', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '请求重试清理', exact: true });
  const retrying = waitForContent(page, {
    method: 'POST',
    path: `/v1/asset-cleanups/${entry.id}/retries`,
  });
  await confirm.getByRole('button', { name: '确认', exact: true }).click();
  const retried = await retrying;
  expect(retried.status()).toBe(202);
  expect(retried.request().postDataJSON()).toEqual({});
  expect(await retried.json()).toMatchObject({ id: entry.id, accepted: true });
  await expect(
    confirm.getByText('重试请求已受理，尚未确认物理删除。', { exact: true }),
  ).toBeVisible();
  const after = await readCleanupFixtureObject(target);
  expect(after).toMatchObject({
    id: before.id,
    state: before.state,
    bytes: before.bytes,
    retainUntil: before.retainUntil,
    writeDeadline: before.writeDeadline,
    blocked: false,
    attempts: 0,
  });
  expect(after.state).not.toBe('deleted');
});
