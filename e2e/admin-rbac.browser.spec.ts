import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  createPermissionInUi,
  expectHttp,
  loginManagement,
  signOutManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

test('role metadata and grants share CAS, disabled grants require explicit removal, and referenced permissions cannot be deleted', async ({
  page,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const first = await createPermissionInUi(page, 'browser:first', 'Browser first grant');
  const second = await createPermissionInUi(page, 'browser:second', 'Browser second grant');
  await page.goto('/dashboard/roles');
  await page.getByRole('button', { name: '创建角色', exact: true }).click();
  const create = page.getByRole('dialog', { name: '创建角色', exact: true });
  await create.getByLabel(/^编码/).fill('browser_editor');
  await create.getByLabel(/^名称/).fill('Browser editor');
  await create
    .getByRole('checkbox', { name: 'Browser first grant (browser:first)', exact: true })
    .check();
  const created = waitForApi(page, 'POST', '/v1/roles');
  await create.getByRole('button', { name: '创建角色', exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  const role = z.object({ id: z.uuid(), version: z.number() }).parse(await createdResponse.json());
  await expect(create).toHaveCount(0);
  await page.getByRole('link', { name: 'Browser editor', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser editor', exact: true })).toBeVisible();
  await page.getByLabel(/^名称/).fill('Browser editor updated');
  await page
    .getByRole('checkbox', { name: 'Browser second grant (browser:second)', exact: true })
    .check();
  let saving = waitForApi(page, 'PATCH', `/v1/roles/${role.id}`);
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(
    page.getByRole('checkbox', { name: 'Browser second grant (browser:second)', exact: true }),
  ).toBeChecked();
  saving = waitForApi(page, 'PUT', `/v1/roles/${role.id}/permissions`);
  await page.getByRole('button', { name: '保存授权', exact: true }).click();
  expect((await saving).status()).toBe(200);
  const confirmed = await bffRequest(page, { method: 'GET', path: `/v1/roles/${role.id}` });
  expect(confirmed.status()).toBe(200);
  const afterBoth = z
    .object({ version: z.number(), name: z.string(), permissionIds: z.array(z.uuid()) })
    .parse(await confirmed.json());
  expect(afterBoth).toMatchObject({ version: role.version + 2, name: 'Browser editor updated' });
  expect(afterBoth.permissionIds.toSorted()).toEqual([first.id, second.id].toSorted());
  await page.getByLabel(/^名称/).fill('CAS retained name');
  await page
    .getByRole('checkbox', { name: 'Browser second grant (browser:second)', exact: true })
    .uncheck();
  expect(
    (
      await bffRequest(page, {
        method: 'PATCH',
        path: `/v1/roles/${role.id}`,
        data: {
          version: afterBoth.version,
          description: 'Concurrent change',
        },
      })
    ).status(),
  ).toBe(200);
  expectHttp(page, browserErrors, { method: 'PATCH', path: `/v1/roles/${role.id}`, status: 409 });
  saving = waitForApi(page, 'PATCH', `/v1/roles/${role.id}`);
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  expect((await saving).status()).toBe(409);
  await expect(page.getByLabel(/^名称/)).toHaveValue('CAS retained name');
  await expect(
    page.getByRole('checkbox', { name: 'Browser second grant (browser:second)', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByRole('button', { name: '保存资料', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重新读取', exact: true }).click();
  await page.getByRole('button', { name: '核对并使用当前版本，保留草稿', exact: true }).click();
  saving = waitForApi(page, 'PATCH', `/v1/roles/${role.id}`);
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  expect((await saving).status()).toBe(200);
  saving = waitForApi(page, 'PUT', `/v1/roles/${role.id}/permissions`);
  await page.getByRole('button', { name: '保存授权', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeDisabled();
  await page.goto('/dashboard/permissions');
  await page.getByRole('button', { name: '操作: Browser first grant', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除权限', exact: true }).click();
  const removePermission = page.getByRole('dialog', {
    name: '删除权限: Browser first grant',
    exact: true,
  });
  expectHttp(page, browserErrors, {
    method: 'DELETE',
    path: `/v1/permissions/${first.id}?version=${first.version}`,
    status: 409,
  });
  const referenced = waitForApi(page, 'DELETE', `/v1/permissions/${first.id}`);
  await removePermission.getByRole('button', { name: '确认删除', exact: true }).click();
  expect((await referenced).status()).toBe(409);
  await expect(removePermission.getByRole('alert')).toBeVisible();
  await removePermission.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: '操作: Browser first grant', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑权限', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑权限', exact: true });
  await edit.getByLabel('状态', { exact: true }).selectOption('disabled');
  await expect(edit.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await edit
    .getByRole('checkbox', {
      name: '我已知晓停用此权限会拒绝依赖它的请求，包括管理读取。',
      exact: true,
    })
    .check();
  saving = waitForApi(page, 'PATCH', `/v1/permissions/${first.id}`);
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(edit).toHaveCount(0);
  await page.goto(`/dashboard/roles/${role.id}`);
  const disabledGrant = page.getByRole('checkbox', {
    name: 'Browser first grant (browser:first)',
    exact: true,
  });
  await expect(disabledGrant).toBeChecked();
  await expect(
    page.getByText('已选权限中有已停用或不可用的项目，请明确移除后再保存。', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeDisabled();
  await disabledGrant.uncheck();
  saving = waitForApi(page, 'PUT', `/v1/roles/${role.id}/permissions`);
  await page.getByRole('button', { name: '保存授权', exact: true }).click();
  expect((await saving).status()).toBe(200);
  await expect(page.getByRole('button', { name: '保存授权', exact: true })).toBeDisabled();
  await page.goto('/dashboard/roles');
  await page.getByRole('button', { name: '操作: CAS retained name', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除', exact: true }).click();
  const removeRole = page.getByRole('dialog', { name: /删除角色/ });
  const deleted = waitForApi(page, 'DELETE', `/v1/roles/${role.id}`);
  await removeRole.getByRole('button', { name: '确认删除', exact: true }).click();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByRole('link', { name: 'CAS retained name', exact: true })).toHaveCount(0);
  await page.goto('/dashboard/permissions');
  for (const permission of [
    { ...first, name: 'Browser first grant' },
    { ...second, name: 'Browser second grant' },
  ]) {
    await page.getByRole('button', { name: `操作: ${permission.name}`, exact: true }).click();
    await page.getByRole('menuitem', { name: '删除权限', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `删除权限: ${permission.name}`, exact: true });
    const removed = waitForApi(page, 'DELETE', `/v1/permissions/${permission.id}`);
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    expect((await removed).status()).toBe(204);
    await expect(dialog).toHaveCount(0);
  }
  await signOutManagement(page);
  expect((await loginManagement(page, applicationAccounts.reader)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/roles');
  await expect(page.getByText('缺少读取此资源的许可。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '创建角色', exact: true })).toHaveCount(0);
  const denied = await page.request.post('/api/cms/v1/roles', {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': crypto.randomUUID() },
    data: { code: 'forbidden_browser', name: 'Forbidden', permissionIds: [] },
  });
  expect(denied.status()).toBe(403);
});
