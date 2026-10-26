import { expect } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  browserDocument,
  confirmContentAction,
  contentRequest,
  grantContentOperations,
  waitForContent,
} from '../test/support/admin-content-browser.ts';

test('real collection creation, rich text, delayed saves and publishing preserve newer typing and expose each persisted version', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, {
    collection: 'articles',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.get',
      'documents.list',
      'documents.create',
      'documents.update',
      'documents.publish',
      'documents.unpublish',
      'versions.list',
      'versions.get',
    ],
  });
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByLabel(/^title/).fill('Browser created article');
  await page.getByLabel(/^slug/).fill('browser-created-article');
  await page.getByLabel(/^summary/).fill('Persisted browser summary');
  await page
    .getByRole('textbox', { name: 'body', exact: true })
    .fill('Rich text entered in the real browser.');
  const creating = waitForContent(page, {
    method: 'POST',
    path: '/v1/collections/articles/documents',
  });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const createdResponse = await creating;
  expect(createdResponse.status()).toBe(201);
  const created = browserDocument.parse(await createdResponse.json());
  expect(created.data).toMatchObject({
    title: 'Browser created article',
    slug: 'browser-created-article',
    summary: 'Persisted browser summary',
    body: {
      version: 1,
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Rich text entered in the real browser.' }],
        },
      ],
    },
  });
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/articles/${created.id}\\?locale=en$`),
  );
  await expect(page.getByLabel(/^title/)).toHaveValue('Browser created article');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: test.info().outputPath('content-editor-1440-zh-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  const path = `/v1/collections/articles/documents/${created.id}`;
  let release: (() => void) | undefined;
  let reached: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const written = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const routeUrl = new URL(`/api/cms${path}`, page.url()).href;
  await page.route(
    routeUrl,
    async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      const upstream = await route.fetch();
      expect(upstream.status()).toBe(200);
      reached?.();
      await held;
      await route.fulfill({ response: upstream });
    },
    { times: 1 },
  );
  try {
    await page.getByLabel(/^title/).fill('Submitted browser change');
    const saving = waitForContent(page, { method: 'PATCH', path });
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await written;
    await page.getByLabel(/^title/).fill('Typing after the request was sent');
    await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled();
    release?.();
    expect((await saving).status()).toBe(200);
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await expect(page.getByLabel(/^title/)).toHaveValue('Typing after the request was sent');
  } finally {
    release?.();
    await page.unroute(routeUrl);
  }
  const saving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const updatedResponse = await saving;
  expect(updatedResponse.status()).toBe(200);
  const updated = browserDocument.parse(await updatedResponse.json());
  expect(updated.revision).toBeGreaterThan(created.revision);
  expect(updated.data['title']).toBe('Typing after the request was sent');
  await expect(
    page
      .getByRole('combobox', { name: '版本', exact: true })
      .locator(`option[value="${updated.versionId}"]`),
  ).toHaveCount(1);
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeEnabled();
  const publishedResponse = await confirmContentAction(page, {
    label: '发布',
    method: 'POST',
    path: `${path}/publications`,
  });
  expect(publishedResponse.status()).toBe(200);
  const published = browserDocument.parse(await publishedResponse.json());
  expect(published.publishedVersionId).toBe(updated.versionId);
  const publishedRead = await contentRequest(page, {
    method: 'GET',
    path: `${path}?locale=en&fallback=%5B%5D&depth=0&mode=published`,
  });
  expect(publishedRead.status()).toBe(200);
  expect(browserDocument.parse(await publishedRead.json()).data['title']).toBe(
    'Typing after the request was sent',
  );
  const withdrawn = await confirmContentAction(page, {
    label: '撤回发布',
    method: 'DELETE',
    path: `${path}/publication`,
  });
  expect(withdrawn.status()).toBe(200);
  expect(browserDocument.parse(await withdrawn.json()).publishedVersionId).toBeNull();
  await expect(page.getByRole('button', { name: '撤回发布', exact: true })).toHaveCount(0);
});
