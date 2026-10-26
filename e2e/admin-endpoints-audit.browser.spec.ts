import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  createPermissionInUi,
  loginManagement,
  test,
  waitForApi,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';

test('endpoint binding changes control the actual operation and audit details expose the complete safe projection and copy the real request ID', async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const permission = await createPermissionInUi(page, 'browser:users', 'Browser users binding');
  const endpoints = await bffRequest(page, { method: 'GET', path: '/v1/endpoints?pageSize=100' });
  expect(endpoints.status()).toBe(200);
  const endpoint = z
    .object({
      rows: z.array(
        z.object({
          operationId: z.string(),
          module: z.string(),
          binding: z.object({ id: z.uuid() }).nullable(),
        }),
      ),
    })
    .parse(await endpoints.json())
    .rows.find((row) => row.operationId === 'admins.list');
  if (!endpoint?.binding)
    throw new Error('The initialized users operation must have its real binding.');
  const bindingPath = `/v1/endpoint-bindings/${endpoint.binding.id}`;
  await page.goto(`/dashboard/endpoints?module=${encodeURIComponent(endpoint.module)}`);
  const action = page.getByRole('button', { name: '操作: admins.list 全局', exact: true });
  await action.click();
  await page.getByRole('menuitem', { name: '配置绑定', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑绑定', exact: true });
  await edit
    .getByLabel(/^绑定权限/)
    .selectOption({ label: 'Browser users binding (browser:users)' });
  const updated = waitForApi(page, 'PATCH', bindingPath);
  await edit.getByRole('button', { name: '保存绑定', exact: true }).click();
  const updateResponse = await updated;
  expect(updateResponse.status()).toBe(200);
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'admins.list' })).toContainText(
    'Browser users binding',
  );
  expect((await bffRequest(page, { method: 'GET', path: '/v1/admins' })).status()).toBe(200);
  await action.click();
  await page.getByRole('menuitem', { name: '解除绑定', exact: true }).click();
  const remove = page.getByRole('dialog', { name: /解除绑定/ });
  const removed = waitForApi(page, 'DELETE', bindingPath);
  await remove.getByRole('button', { name: '确认解除绑定', exact: true }).click();
  expect((await removed).status()).toBe(204);
  await expect(remove).toHaveCount(0);
  expect((await bffRequest(page, { method: 'GET', path: '/v1/admins' })).status()).toBe(403);
  await action.click();
  await page.getByRole('menuitem', { name: '配置绑定', exact: true }).click();
  const create = page.getByRole('dialog', { name: '创建绑定', exact: true });
  await create
    .getByLabel(/^绑定权限/)
    .selectOption({ label: 'Browser users binding (browser:users)' });
  const recreated = waitForApi(page, 'POST', '/v1/endpoint-bindings');
  await create.getByRole('button', { name: '保存绑定', exact: true }).click();
  expect((await recreated).status()).toBe(201);
  await expect(create).toHaveCount(0);
  expect((await bffRequest(page, { method: 'GET', path: '/v1/admins' })).status()).toBe(200);
  await page.goto('/dashboard/audit-logs');
  await page.getByLabel('操作', { exact: true }).fill('permissions.create');
  await page.getByLabel('目标 ID', { exact: true }).fill(permission.id);
  const projectionSchema = z.object({
    rows: z.array(
      z.object({
        id: z.uuid(),
        actorKind: z.literal('admin'),
        actorId: z.uuid(),
        operationId: z.string(),
        targetType: z.string(),
        targetId: z.string(),
        requestId: z.string(),
        detail: z.record(z.string(), z.unknown()),
        createdAt: z.iso.datetime(),
      }),
    ),
  });
  const filtered = await captureApiJson(
    page,
    {
      method: 'GET',
      path: '/v1/audit-logs',
      status: 200,
      query: { targetId: permission.id, operationId: 'permissions.create' },
    },
    projectionSchema,
  );
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  const projection = (await filtered.read()).rows;
  expect(projection).toHaveLength(1);
  const [record] = projection;
  if (!record) throw new Error('The real permission mutation must create its audit record.');
  expect(record.targetId).toBe(permission.id);
  await page.getByRole('button', { name: '查看详情', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '审计详情', exact: true });
  const values = await dialog.getByRole('definition').allTextContents();
  for (const value of [
    record.id,
    record.actorId,
    record.operationId,
    record.targetType,
    record.targetId,
    record.requestId,
  ]) {
    expect(values.filter((item) => item === value)).toHaveLength(1);
  }
  expect(await dialog.locator('pre').textContent()).toBe(JSON.stringify(record.detail, null, 2));
  await dialog.getByRole('button', { name: '复制请求编号', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('已复制');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(record.requestId);
  expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? '').origin);
});
