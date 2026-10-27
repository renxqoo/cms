import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  captureApiJson,
  loginManagement,
  test,
} from '../test/support/admin-browser-management.ts';

const document = z.object({
  id: z.uuid(),
  revision: z.number(),
  data: z.record(z.string(), z.unknown()),
});
test('copies only empty fields and then overwrites the saved translation through the real editor', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const created = await page.request.fetch('/api/cms/v1/collections/articles/documents', {
    method: 'POST',
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() },
    data: {
      dataByLocale: {
        en: { title: 'Locale source', slug: 'locale-copy-journey', summary: 'Copied summary' },
        'zh-CN': { title: 'Preserved translation', slug: 'locale-copy-target' },
      },
    },
  });
  expect(created.status()).toBe(201);
  const source = document.parse(await created.json());
  await page.goto(`/dashboard/collections/articles/${source.id}?locale=en`);
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('Locale source');
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制到其他语言', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '复制到其他语言', exact: true });
  await dialog.getByLabel('目标语言', { exact: true }).selectOption('zh-CN');
  const copying = await captureApiJson(
    page,
    {
      method: 'POST',
      path: `/v1/collections/articles/documents/${source.id}/locale-copies`,
      status: 200,
    },
    document,
  );
  await dialog.getByRole('button', { name: '复制到其他语言', exact: true }).click();
  expect((await copying.read()).data).toMatchObject({
    title: 'Preserved translation',
    summary: 'Copied summary',
    slug: 'locale-copy-target',
  });
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/articles/${source.id}\\?locale=zh-CN$`),
  );
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('Preserved translation');
  await page.goto(`/dashboard/collections/articles/${source.id}?locale=en`);
  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制到其他语言', exact: true }).click();
  const overwrite = page.getByRole('dialog', { name: '复制到其他语言', exact: true });
  await overwrite.getByLabel('复制方式', { exact: true }).selectOption('overwrite');
  const replacing = await captureApiJson(
    page,
    {
      method: 'POST',
      path: `/v1/collections/articles/documents/${source.id}/locale-copies`,
      status: 200,
    },
    document,
  );
  await overwrite.getByRole('button', { name: '复制到其他语言', exact: true }).click();
  expect((await replacing.read()).data).toMatchObject({
    title: 'Locale source',
    summary: 'Copied summary',
    slug: 'locale-copy-journey',
  });
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/collections/articles/${source.id}\\?locale=zh-CN$`),
  );
  await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue('Locale source');
  const persisted = await bffRequest(page, {
    method: 'GET',
    path: `/v1/collections/articles/documents/${source.id}?locale=zh-CN&fallback=[]`,
  });
  expect(persisted.status()).toBe(200);
  expect(document.parse(await persisted.json()).data['title']).toBe('Locale source');
});
