import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  test,
  loginManagement,
  waitForApi,
  expectHttp,
} from '../test/support/admin-browser-management.ts';

test('retries rejected bytes through a new session and cancels that actual remote session', async ({
  page,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/resources');
  const firstCreated = waitForApi(page, 'POST', '/v1/collections/media/uploads');
  const rejected = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname.endsWith('/content') &&
      response.status() === 415,
  );
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({
    name: 'corrupt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('%PDF-1.7\nnot an image\n%%EOF'),
  });
  expect((await firstCreated).status()).toBe(201);
  const firstRejected = await rejected;
  const first = { id: z.uuid().parse(new URL(firstRejected.url()).pathname.split('/').at(-2)) };
  expectHttp(page, browserErrors, {
    method: 'PUT',
    path: `/v1/collections/media/uploads/${first.id}/content`,
    status: 415,
  });
  expect((await rejected).status()).toBe(415);
  const retried = waitForApi(page, 'POST', '/v1/collections/media/uploads');
  const rejectedAgain = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname.endsWith('/content') &&
      response.status() === 415,
  );
  await page.getByRole('button', { name: '创建新上传', exact: true }).click();
  expect((await retried).status()).toBe(201);
  const secondRejected = await rejectedAgain;
  const second = { id: z.uuid().parse(new URL(secondRejected.url()).pathname.split('/').at(-2)) };
  expect(second.id).not.toBe(first.id);
  expectHttp(page, browserErrors, {
    method: 'PUT',
    path: `/v1/collections/media/uploads/${second.id}/content`,
    status: 415,
  });
  expect((await rejectedAgain).status()).toBe(415);
  const row = page.getByRole('listitem').filter({ hasText: 'corrupt.png' }).last();
  const cancelled = waitForApi(page, 'DELETE', `/v1/collections/media/uploads/${second.id}`);
  await row.getByRole('button', { name: '取消上传', exact: true }).click();
  expect((await cancelled).status()).toBe(204);
  await expect(row.getByText('已取消', { exact: true })).toBeVisible();
  const remote = await page.request.get(`/api/cms/v1/collections/media/uploads/${second.id}`);
  expect(remote.status()).toBe(200);
  expect(z.object({ status: z.string() }).parse(await remote.json()).status).toBe('cancelled');
});
