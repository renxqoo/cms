import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { expectHttp, loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  browserDocument,
  contentRequest,
  grantContentOperations,
  waitForContent,
} from '../test/support/admin-content-browser.ts';
import {
  createReadyMedia,
  downloadBytes,
  expectReleasedBlobs,
  mediaBrowserOperations,
  observeBlobUrls,
} from '../test/support/admin-asset-browser.ts';
import { png } from '../test/support/png.ts';

test('replacing a media file preserves fixed historical binding downloads and revoking their operation clears the private Blob', async ({
  page,
  browserErrors,
}) => {
  await observeBlobUrls(page);
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, { collection: 'media', operations: mediaBrowserOperations });
  await grantContentOperations(page, {
    collection: 'articles',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.create',
      'documents.get',
      'documents.update',
      'assets.downloadBinding',
    ],
  });
  const original = png([255, 0, 0]);
  const replacement = png([0, 0, 255]);
  const prepared = await createReadyMedia(page, {
    bytes: original,
    filename: 'fixed-original.png',
    mimeType: 'image/png',
    title: 'Historical media source',
  });
  const media = prepared.document;
  const articleResponse = await contentRequest(page, {
    method: 'POST',
    path: '/v1/collections/articles/documents',
    idempotent: true,
    data: {
      locale: 'en',
      data: {
        title: 'Historical reference article',
        slug: 'historical-reference-article',
        cover: { collection: 'media', id: media.id },
      },
    },
  });
  expect(articleResponse.status()).toBe(201);
  const article = browserDocument
    .extend({ mediaBindings: z.array(z.object({ bindingId: z.uuid(), sourcePath: z.string() })) })
    .parse(await articleResponse.json());
  const binding = article.mediaBindings.find((item) => item.sourcePath.endsWith('cover'));
  if (!binding) throw new Error('The actual article write must fix its cover media binding.');
  await page.goto(`/dashboard/collections/media/${media.id}?locale=en`);
  const replaced = waitForContent(page, {
    method: 'PATCH',
    path: `/v1/collections/media/documents/${media.id}`,
  });
  await page
    .getByLabel('替换文件', { exact: true })
    .and(page.locator('input[type=file]'))
    .setInputFiles({ name: 'replacement-blue.png', mimeType: 'image/png', buffer: replacement });
  const result = await replaced;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON()).toMatchObject({
    revision: media.revision,
    uploadId: expect.any(String),
  });
  await expect(
    page.getByLabel('替换文件', { exact: true }).and(page.locator('input[type=file]')),
  ).toBeEnabled();
  const current = await contentRequest(page, {
    method: 'GET',
    path: `/v1/collections/media/documents/${media.id}/file?mode=editing`,
  });
  expect(current.status()).toBe(200);
  expect(await current.body()).toEqual(replacement);
  await page.goto(`/dashboard/collections/articles/${article.id}?locale=en`);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载文件', exact: true }).click();
  expect(await downloadBytes(await downloaded)).toEqual(original);
  const endpoints = await contentRequest(page, {
    method: 'GET',
    path: '/v1/endpoints?module=assets&pageSize=100',
  });
  expect(endpoints.status()).toBe(200);
  const endpoint = z
    .object({
      rows: z.array(
        z.object({
          operationId: z.string(),
          collectionKey: z.string().nullable(),
          binding: z.object({ id: z.uuid(), version: z.number() }).nullable(),
        }),
      ),
    })
    .parse(await endpoints.json())
    .rows.find(
      (row) => row.operationId === 'assets.downloadBinding' && row.collectionKey === 'articles',
    );
  if (!endpoint?.binding)
    throw new Error('Historical media download must have its actual scoped operation binding.');
  const denied = await contentRequest(page, {
    method: 'DELETE',
    path: `/v1/endpoint-bindings/${endpoint.binding.id}?version=${endpoint.binding.version}`,
  });
  expect(denied.status()).toBe(204);
  const path = `/v1/collections/articles/documents/${article.id}/media-bindings/${binding.bindingId}/file`;
  const revokedDownload = await contentRequest(page, {
    method: 'GET',
    path: `${path}?mode=editing&versionId=${article.versionId}`,
  });
  expect(revokedDownload.status()).toBe(403);
  expectHttp(page, browserErrors, {
    method: 'GET',
    path: `${path}?mode=editing&versionId=${article.versionId}`,
    status: 403,
  });
  const deniedPreview = waitForContent(page, { method: 'GET', path });
  await page.getByRole('button', { name: '刷新', exact: true }).first().click();
  expect((await deniedPreview).status()).toBe(403);
  await expect(
    page.getByRole('status').filter({ hasText: '当前账号没有访问此功能的权限。' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '下载文件', exact: true })).toHaveCount(0);
  await expectReleasedBlobs(page);
  expect((await page.evaluate(() => window.oneasterBlobLifecycle.created)).length).toBeGreaterThan(
    0,
  );
});
