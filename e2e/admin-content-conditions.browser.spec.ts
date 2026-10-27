import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { captureApiJson, loginManagement, test } from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  data: z.record(z.string(), z.unknown()),
});

test('conditions update through the real preview API while registered field components and hidden values survive save and reload', async ({
  page,
}, info) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  const title = page.getByRole('textbox', { name: /^title/ });
  const summary = page.getByRole('textbox', { name: 'summary', exact: true });
  await expect(title).toBeVisible();
  await expect(summary).not.toBeVisible();
  await expect(page.getByText('0 / 256 个字符', { exact: true })).toBeVisible();
  const preview = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/cms/v1/collections/articles/editor/preview',
  );
  await title.fill('First title');
  expect((await preview).status()).toBe(200);
  await expect(summary).toBeVisible();
  await summary.fill('Retained summary');
  await title.clear();
  await expect(summary).not.toBeVisible();
  await title.fill('Restored title');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveValue('Retained summary');
  await expect(page.getByText('14 / 256 个字符', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: /^slug/ }).fill(`conditions-${info.project.name}`);
  const saved = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const document = await saved.read();
  expect(document.data['summary']).toBe('Retained summary');
  await expect(page).toHaveURL(
    new URL(`/dashboard/collections/articles/${document.id}?locale=en`, page.url()).href,
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'summary', exact: true })).toHaveValue(
    'Retained summary',
  );
  await expect(page.getByRole('region', { name: 'Articles', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('conditional-editor-390.png'), fullPage: true });
});
