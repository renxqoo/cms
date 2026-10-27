import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  expectHttp,
  loginManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
});

async function createInUi(page: Page, slug: string) {
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Published story');
  await page.getByRole('textbox', { name: /^slug/ }).fill(slug);
  const saving = waitForApi(page, 'POST', '/v1/collections/articles/documents');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(201);
  await expect(page).toHaveURL(/\/dashboard\/collections\/articles\/[0-9a-f-]+\?locale=en$/);
  const id = z.uuid().parse(new URL(page.url()).pathname.split('/').at(-1));
  const stored = await bffRequest(page, {
    method: 'GET',
    path: `/v1/collections/articles/documents/${id}?locale=en`,
  });
  expect(stored.status()).toBe(200);
  return documentSchema.parse(await stored.json());
}

test('regression: reopening a document waits for its editor before folder CAS, trash restoration and no-fallback locale editing at 390px', async ({
  page,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const claiming = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      /\/v1\/collections\/articles\/documents\/[0-9a-f-]+\/lock$/.test(
        new URL(request.url()).pathname,
      ),
  );
  const created = await createInUi(page, 'browser-folder-story');
  const { editorId } = z
    .object({ editorId: z.uuid() })
    .parse((await claiming).postDataJSON() as unknown);
  const path = `/v1/collections/articles/documents/${created.id}`;
  expectHttp(page, browserErrors, {
    method: 'POST',
    path: '/v1/collections/articles/editor/preview',
    status: 409,
  });
  await page.getByRole('textbox', { name: /^title/ }).fill('Preserved conflict draft');
  const concurrent = await page.request.fetch(`/api/cms${path}`, {
    method: 'PATCH',
    headers: { origin: new URL(page.url()).origin, 'X-CMS-Editor-Session': editorId },
    data: {
      revision: created.revision,
      locale: 'en',
      data: { summary: 'Concurrent request changed this' },
    },
  });
  expect(concurrent.status()).toBe(200);
  expectHttp(page, browserErrors, { method: 'PATCH', path, status: 409 });
  const conflict = waitForApi(page, 'PATCH', path);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue(
    'Preserved conflict draft',
  );
  await page.getByRole('button', { name: '保留草稿，基于最新版本继续编辑', exact: true }).click();
  const saving = waitForApi(page, 'PATCH', path);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await page.getByRole('button', { name: '管理文件夹', exact: true }).click();
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  const folderDialog = page.getByRole('dialog', { name: '新建文件夹', exact: true });
  await folderDialog.getByLabel('名称', { exact: true }).fill('Browser editorial folder');
  const folderResponse = waitForApi(page, 'POST', '/v1/folders');
  await folderDialog.getByRole('button', { name: '保存', exact: true }).click();
  expect((await folderResponse).status()).toBe(201);
  await page.getByRole('dialog', { name: '新建文件夹', exact: true }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '管理文件夹', exact: true })).toHaveCount(0);
  const folderOption = page
    .getByRole('combobox', { name: '文件夹', exact: true })
    .getByRole('option', { name: 'Browser editorial folder', exact: true });
  await expect(folderOption).toHaveCount(1);
  const folder = { id: z.uuid().parse(await folderOption.getAttribute('value')) };
  await page.getByRole('button', { name: 'Preserved conflict draft', exact: true }).click();
  await expect(page).toHaveURL(
    new URL(`/dashboard/collections/articles/${created.id}?locale=en`, page.url()).href,
  );
  await page.getByLabel('文件夹', { exact: true }).selectOption(folder.id);
  const moving = waitForApi(page, 'PATCH', path);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await moving).status()).toBe(200);
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '移至回收站', exact: true }).click();
  const archiving = waitForApi(page, 'DELETE', path);
  await page
    .getByRole('dialog', { name: '确认操作', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  expect((await archiving).status()).toBe(200);
  await expect(page).toHaveURL(/trashed=true/);
  const restored = waitForApi(page, 'POST', `${path}/trash-restorations`);
  await page.getByRole('button', { name: '恢复文档', exact: true }).click();
  await page
    .getByRole('dialog', { name: '恢复文档', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  expect((await restored).status()).toBe(200);
  await expect(page.getByRole('button', { name: '恢复文档', exact: true })).toHaveCount(0);
  await page.goto(`/dashboard/collections/articles/${created.id}?locale=zh-CN`);
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('textbox', { name: /^title/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
