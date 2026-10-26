import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { png } from '../test/support/png.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { test, loginManagement, waitForApi } from '../test/support/admin-browser-management.ts';
import { seedMedia, mediaTargetSchema } from '../test/support/admin-assets-browser.ts';

test('regression: opening persisted rich text with media keeps publishing enabled without another save', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const media = await seedMedia(page, 'article-reference.png', png([24, 48, 72]));
  const { origin } = new URL(page.url());
  const created = await page.request.post('/api/cms/v1/collections/articles/documents', {
    headers: { origin, 'idempotency-key': randomUUID() },
    data: {
      locale: 'en',
      data: {
        title: 'Unchanged rich text',
        slug: `unchanged-${randomUUID()}`,
        body: {
          version: 1,
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: 'Saved content' },
                { type: 'media', collection: 'media', id: media.id },
              ],
            },
          ],
        },
      },
    },
  });
  expect(created.status()).toBe(201);
  const article = mediaTargetSchema.parse(await created.json());
  await page.goto(`/dashboard/collections/articles/${article.id}?locale=en`);
  await expect(page.getByRole('textbox', { name: 'body', exact: true })).toHaveAttribute(
    'contenteditable',
    'true',
  );
  const fixed = page.getByRole('heading', { name: '固定媒体引用', exact: true }).locator('..');
  await expect(
    fixed.getByRole('img', { name: 'article-reference.png', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('有未保存更改', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '发布', exact: true }).click();
  const published = waitForApi(
    page,
    'POST',
    `/v1/collections/articles/documents/${article.id}/publications`,
  );
  await page
    .getByRole('dialog', { name: '确认操作', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  expect((await published).status()).toBe(200);
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '取消发布', exact: true })).toBeEnabled();
});
