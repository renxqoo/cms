import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  expectHttp,
  loginManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

function observeRecoveryProbes(page: Page, errors: Parameters<typeof expectHttp>[1]) {
  const paths = ['/v1/endpoints?page=1&pageSize=1', '/v1/permissions?page=1&pageSize=1'];
  const counts = new Map<string, number>();
  function observe(response: Response) {
    const url = new URL(response.url());
    const path = `${url.pathname.slice('/api/cms'.length)}${url.search}`;
    if (response.request().method() === 'GET' && response.status() === 403 && paths.includes(path))
      counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  page.on('response', observe);
  return () => {
    page.off('response', observe);
    for (const path of paths) {
      const count = counts.get(path) ?? 0;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
      expectHttp(page, errors, { method: 'GET', path, status: 403, count });
    }
  };
}

test('independent security reads recover both denied ordinary catalogs with real permission and binding writes', async ({
  page,
  browserErrors,
}) => {
  const readyOperations = waitForApi(page, 'GET', '/v1/me/operations');
  const readyNavigation = waitForApi(page, 'GET', '/v1/me/navigation');
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await readyOperations).status()).toBe(200);
  expect((await readyNavigation).status()).toBe(200);
  await page.goto('/dashboard/navigation');
  for (const node of [
    { name: 'Recovery workspace', type: 'group' },
    { name: 'Configured roles', type: 'page' },
  ]) {
    await page.getByRole('button', { name: '创建节点', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建节点', exact: true });
    await dialog.getByLabel(/^名称/).fill(node.name);
    await dialog.getByLabel('类型', { exact: true }).selectOption(node.type);
    if (node.type === 'page') {
      await dialog.getByLabel(/^父级节点/).selectOption({ label: 'Recovery workspace' });
      await dialog.getByLabel(/^页面路径/).selectOption('/dashboard/roles');
    }
    const created = waitForApi(page, 'POST', '/v1/navigation');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(dialog).toHaveCount(0);
  }
  const catalog = await bffRequest(page, {
    method: 'GET',
    path: '/v1/endpoints?module=access&pageSize=100',
  });
  expect(catalog.status()).toBe(200);
  const endpoints = z
    .object({
      rows: z.array(
        z.object({
          operationId: z.string(),
          binding: z.object({ id: z.uuid(), version: z.number().int().positive() }).nullable(),
        }),
      ),
    })
    .parse(await catalog.json()).rows;
  for (const operation of ['endpoints.list', 'permissions.list']) {
    const binding = endpoints.find((row) => row.operationId === operation)?.binding;
    if (!binding) throw new Error('The isolated recovery fixture requires ordinary read bindings.');
    expect(
      (
        await bffRequest(page, {
          method: 'DELETE',
          path: `/v1/endpoint-bindings/${binding.id}?version=${binding.version}`,
        })
      ).status(),
    ).toBe(204);
  }
  const verifyDeniedProbes = observeRecoveryProbes(page, browserErrors);
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Configured roles', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '访问恢复', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '账户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '访问恢复', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/access-recovery$/);
  await page.getByRole('button', { name: '创建权限', exact: true }).click();
  const permission = page.getByRole('dialog', { name: '创建权限', exact: true });
  await permission.getByLabel(/^权限编码/).fill('browser:recovery');
  await permission.getByLabel(/^名称/).fill('Recovery read');
  const created = waitForApi(page, 'POST', '/v1/permissions');
  await permission.getByRole('button', { name: '保存', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(permission).toHaveCount(0);
  const catalogSection = page.getByRole('heading', { name: '操作目录', exact: true }).locator('..');
  for (const operation of ['endpoints.list', 'permissions.list']) {
    await catalogSection.getByLabel('搜索记录', { exact: true }).fill(operation);
    await catalogSection.getByRole('button', { name: '搜索', exact: true }).click();
    await catalogSection
      .getByRole('button', { name: `操作: ${operation} 全局`, exact: true })
      .click();
    await page.getByRole('menuitem', { name: '配置绑定', exact: true }).click();
    const binding = page.getByRole('dialog', { name: '创建绑定', exact: true });
    await binding
      .getByLabel(/^绑定权限/)
      .selectOption({ label: 'Recovery read (browser:recovery)' });
    const repaired = waitForApi(page, 'POST', '/v1/endpoint-bindings');
    await binding.getByRole('button', { name: '保存绑定', exact: true }).click();
    expect((await repaired).status()).toBe(201);
    await expect(binding).toHaveCount(0);
  }
  expect((await bffRequest(page, { method: 'GET', path: '/v1/endpoints' })).status()).toBe(200);
  expect((await bffRequest(page, { method: 'GET', path: '/v1/permissions' })).status()).toBe(200);
  await page.getByRole('button', { name: '重新核实普通读取', exact: true }).click();
  await expect(
    page.getByText('普通接口和权限目录均可读取，请使用常规管理页面。', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText('普通接口和权限目录均可读取，请使用常规管理页面。', { exact: true }),
  ).toBeVisible();
  verifyDeniedProbes();
});

test('an ordinary administrator cannot enter the security recovery workspace or read its API', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.reader)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/access-recovery');
  await expect(page.getByText('当前账户没有独立安全恢复许可。', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '持久化绑定', exact: true })).toHaveCount(0);
  expect(
    (
      await bffRequest(page, { method: 'GET', path: '/v1/security/recovery?resource=bindings' })
    ).status(),
  ).toBe(403);
});
