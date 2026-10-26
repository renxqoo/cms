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

test('folder tree CRUD preserves a conflicting rename and moving a document uses its current revision', async ({
  page,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await grantContentOperations(page, {
    collection: 'articles',
    operations: [
      'collections.get',
      'collections.editor',
      'documents.create',
      'documents.get',
      'documents.update',
      'folders.list',
      'folders.create',
      'folders.update',
      'folders.delete',
    ],
  });
  const response = await contentRequest(page, {
    method: 'POST',
    path: '/v1/collections/articles/documents',
    idempotent: true,
    data: { locale: 'en', data: { title: 'Folder document', slug: 'folder-document' } },
  });
  expect(response.status()).toBe(201);
  const document = browserDocument.parse(await response.json());
  await page.goto(`/dashboard/collections/articles/${document.id}?locale=en`);
  const folders: { id: string; version: number }[] = [];
  for (const name of ['Browser folder A', 'Browser folder B']) {
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建文件夹', exact: true });
    await dialog.getByLabel(/^名称/).fill(name);
    if (folders[0])
      await dialog.getByLabel('上级文件夹', { exact: true }).selectOption(folders[0].id);
    const creating = waitForContent(page, { method: 'POST', path: '/v1/folders' });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    const created = await creating;
    expect(created.status()).toBe(201);
    folders.push(
      z.object({ id: z.uuid(), version: z.number().int().positive() }).parse(await created.json()),
    );
    await expect(dialog).toHaveCount(0);
  }
  const [parent, child] = folders;
  if (!parent || !child) throw new Error('The folder tree must contain its parent and child.');
  await page.getByRole('button', { name: '编辑文件夹', exact: true }).first().click();
  const edit = page.getByRole('dialog', { name: '编辑文件夹', exact: true });
  await expect(edit.getByLabel(/^名称/)).toHaveValue('Browser folder A');
  await edit.getByLabel(/^名称/).fill('Retained folder rename');
  const concurrent = await contentRequest(page, {
    method: 'PATCH',
    path: `/v1/folders/${parent.id}`,
    data: {
      collection: 'articles',
      version: parent.version,
      name: 'Concurrent folder name',
      parentId: null,
    },
  });
  expect(concurrent.status()).toBe(200);
  expectHttp(page, browserErrors, {
    method: 'PATCH',
    path: `/v1/folders/${parent.id}`,
    status: 409,
  });
  let saving = waitForContent(page, { method: 'PATCH', path: `/v1/folders/${parent.id}` });
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(409);
  await expect(edit.getByLabel(/^名称/)).toHaveValue('Retained folder rename');
  await edit.getByRole('button', { name: '刷新', exact: true }).click();
  await edit.getByRole('button', { name: '使用当前修订继续编辑', exact: true }).click();
  saving = waitForContent(page, { method: 'PATCH', path: `/v1/folders/${parent.id}` });
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  const renamed = await saving;
  expect(renamed.status()).toBe(200);
  expect(await renamed.json()).toMatchObject({ name: 'Retained folder rename', parentId: null });
  await expect(edit).toHaveCount(0);
  const path = `/v1/collections/articles/documents/${document.id}`;
  await page.getByRole('combobox', { name: '文件夹', exact: true }).selectOption(child.id);
  let moving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '移至文件夹', exact: true }).click();
  const moved = await moving;
  expect(moved.status()).toBe(200);
  expect(browserDocument.parse(await moved.json()).folderId).toBe(child.id);
  await expect(page.getByRole('button', { name: '移至文件夹', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: '文件夹', exact: true }).selectOption('');
  moving = waitForContent(page, { method: 'PATCH', path });
  await page.getByRole('button', { name: '移至文件夹', exact: true }).click();
  const movedOut = await moving;
  expect(movedOut.status()).toBe(200);
  expect(browserDocument.parse(await movedOut.json()).folderId).toBeNull();
  await expect(page.getByRole('button', { name: '移至文件夹', exact: true })).toBeEnabled();
  for (const folder of [child, parent]) {
    await page
      .getByRole('button', { name: '编辑文件夹', exact: true })
      .nth(folder.id === child.id ? 1 : 0)
      .click();
    await edit.getByRole('button', { name: '删除文件夹', exact: true }).click();
    const removing = waitForContent(page, { method: 'DELETE', path: `/v1/folders/${folder.id}` });
    await edit.getByRole('button', { name: '删除文件夹', exact: true }).last().click();
    expect((await removing).status()).toBe(204);
    await expect(edit).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: '编辑文件夹', exact: true })).toHaveCount(0);
});
