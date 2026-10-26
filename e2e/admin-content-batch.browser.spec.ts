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

const batchJob = z.object({
  id: z.uuid(),
  status: z.enum(['partial', 'succeeded']),
  items: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(['succeeded', 'failed']),
      error: z.object({ code: z.string() }).optional(),
    }),
  ),
});

test('batch updates report an actual conflicting item separately and trash/archive restoration operates on explicit current revisions', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, {
    collection: 'articles',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.list',
      'documents.create',
      'documents.get',
      'documents.update',
      'documents.archive',
      'documents.restoreTrash',
      'content.batch',
      'content.getJob',
    ],
  });
  const documents = [];
  for (const name of ['First', 'Second']) {
    const created = await contentRequest(page, {
      method: 'POST',
      path: '/v1/collections/articles/documents',
      idempotent: true,
      data: {
        locale: 'en',
        data: { title: `Browser batch ${name}`, slug: `browser-batch-${name.toLowerCase()}` },
      },
    });
    expect(created.status()).toBe(201);
    documents.push(browserDocument.parse(await created.json()));
  }
  const [first, second] = documents;
  if (!first || !second) throw new Error('The batch requires two independently created documents.');
  await page.goto('/dashboard/collections/articles?locale=en');
  for (const document of documents)
    await page
      .getByRole('checkbox', { name: `选择 ${String(document.data['title'])}`, exact: true })
      .check();
  await page.getByRole('combobox', { name: '操作', exact: true }).selectOption('update');
  await page.getByRole('button', { name: '执行批量操作', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '执行批量操作', exact: true });
  await dialog.getByLabel(/^summary/).fill('Applied only to an unchanged selected document');
  const conflict = await contentRequest(page, {
    method: 'PATCH',
    path: `/v1/collections/articles/documents/${first.id}`,
    data: {
      locale: 'en',
      revision: first.revision,
      data: { summary: 'Concurrent first document change' },
    },
  });
  expect(conflict.status()).toBe(200);
  const submitting = waitForContent(page, {
    method: 'POST',
    path: '/v1/collections/articles/batches',
  });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  const submitted = await submitting;
  expect(submitted.status()).toBe(200);
  const partial = batchJob.parse(await submitted.json());
  expect(partial.status).toBe('partial');
  expect(partial.items).toEqual(
    expect.arrayContaining([
      { id: first.id, status: 'failed', error: { code: 'version_conflict' } },
      expect.objectContaining({ id: second.id, status: 'succeeded' }),
    ]),
  );
  await expect(dialog.getByRole('status').filter({ hasText: /^partial$/ })).toBeVisible();
  await expect(dialog.getByRole('listitem').filter({ hasText: first.id })).toContainText(
    'version_conflict',
  );
  await expect(dialog.getByRole('listitem').filter({ hasText: second.id })).toContainText(
    'succeeded',
  );
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  for (const document of documents) {
    const response = await contentRequest(page, {
      method: 'GET',
      path: `/v1/collections/articles/documents/${document.id}?locale=en&fallback=%5B%5D&depth=0&mode=editing`,
    });
    expect(response.status()).toBe(200);
    expect(browserDocument.parse(await response.json()).data['summary']).toBe(
      document.id === first.id
        ? 'Concurrent first document change'
        : 'Applied only to an unchanged selected document',
    );
    await page
      .getByRole('checkbox', { name: `选择 ${String(document.data['title'])}`, exact: true })
      .check();
  }
  await page.getByRole('combobox', { name: '操作', exact: true }).selectOption('archive');
  await page.getByRole('button', { name: '执行批量操作', exact: true }).click();
  let operating = waitForContent(page, {
    method: 'POST',
    path: '/v1/collections/articles/batches',
  });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  let operation = await operating;
  expect(operation.status()).toBe(200);
  expect(batchJob.parse(await operation.json()).status).toBe('succeeded');
  await expect(dialog.getByRole('status').filter({ hasText: /^succeeded$/ })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.getByText('没有文档', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '视图', exact: true }).selectOption('trash');
  for (const document of documents)
    await page
      .getByRole('checkbox', { name: `选择 ${String(document.data['title'])}`, exact: true })
      .check();
  await page.getByRole('button', { name: '执行批量操作', exact: true }).click();
  operating = waitForContent(page, { method: 'POST', path: '/v1/collections/articles/batches' });
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  operation = await operating;
  expect(operation.status()).toBe(200);
  expect(batchJob.parse(await operation.json()).status).toBe('succeeded');
  await expect(dialog.getByRole('status').filter({ hasText: /^succeeded$/ })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await expect(page.getByText('没有文档', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '视图', exact: true }).selectOption('editing');
  for (const document of documents)
    await expect(
      page.getByRole('checkbox', { name: `选择 ${String(document.data['title'])}`, exact: true }),
    ).toBeVisible();
});
