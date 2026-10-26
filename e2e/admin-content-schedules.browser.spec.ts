import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  browserDocument,
  contentRequest,
  grantContentOperations,
  waitForContent,
} from '../test/support/admin-content-browser.ts';

test('publication schedules pin a real version, survive reload and show the actual cancellation result', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, {
    collection: 'pages',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.create',
      'documents.get',
      'documents.update',
      'content.listJobs',
      'content.getJob',
      'content.schedulePublication',
      'content.cancelPublicationSchedule',
      'documents.publish',
    ],
  });
  const response = await contentRequest(page, {
    method: 'POST',
    path: '/v1/collections/pages/documents',
    idempotent: true,
    data: {
      locale: 'en',
      data: { title: 'Scheduled browser page', slug: 'scheduled-browser-page' },
    },
  });
  expect(response.status()).toBe(201);
  const document = browserDocument.parse(await response.json());
  await page.goto(`/dashboard/collections/pages/${document.id}?locale=en`);
  const time = await page.evaluate(() => {
    const date = new Date(Date.now() + 3_600_000);
    date.setSeconds(0, 0);
    return {
      local: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
      utc: date.toISOString(),
    };
  });
  await page.getByLabel('执行时间（本地时间）', { exact: true }).fill(time.local);
  const path = `/v1/collections/pages/documents/${document.id}/publication-schedules`;
  const scheduling = waitForContent(page, { method: 'POST', path }).then(
    async (scheduledResponse) => ({
      response: scheduledResponse,
      receipt: z.object({ jobId: z.uuid() }).parse(await scheduledResponse.json()),
    }),
  );
  await page.getByRole('button', { name: '安排发布', exact: true }).click();
  const {
    response: scheduled,
    receipt: { jobId },
  } = await scheduling;
  expect(scheduled.status()).toBe(202);
  expect(scheduled.request().postDataJSON()).toEqual({
    revision: document.revision,
    versionId: document.versionId,
    executeAt: time.utc,
  });
  let row = page.getByRole('listitem').filter({ hasText: jobId });
  await expect(row).toContainText('queued');
  await expect(row).toContainText(document.versionId);
  await expect(row).toContainText(time.utc);
  await page.reload();
  row = page.getByRole('listitem').filter({ hasText: jobId });
  await expect(row).toContainText('queued');
  const cancelling = waitForContent(page, { method: 'DELETE', path: `${path}/${jobId}` });
  await row.getByRole('button', { name: '取消计划', exact: true }).click();
  expect((await cancelling).status()).toBe(204);
  await expect(row).toContainText('cancelled');
  await expect(row.getByRole('button', { name: '取消计划', exact: true })).toHaveCount(0);
  const job = await contentRequest(page, {
    method: 'GET',
    path: `/v1/collections/pages/jobs/${jobId}`,
  });
  expect(job.status()).toBe(200);
  expect(await job.json()).toMatchObject({
    id: jobId,
    status: 'cancelled',
    documentId: document.id,
    expectedRevision: document.revision,
    requestedVersionId: document.versionId,
  });
});
