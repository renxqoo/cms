import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  expectHttp,
  loginManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

test('profile CAS preserves a draft and successful password change revokes sessions without prompting for unrelated unsaved profile changes', async ({
  page,
  context,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/account');
  await expect(page.getByRole('heading', { name: '账户设置', exact: true })).toBeVisible();
  const profile = page.getByRole('form', { name: '个人资料', exact: true });
  await profile.getByLabel('显示名称').fill('Browser profile saved');
  let saved = waitForApi(page, 'PATCH', '/v1/me');
  await profile.getByRole('button', { name: '保存资料', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(profile.getByText('个人资料已保存。', { exact: true })).toBeVisible();
  const before = await bffRequest(page, { method: 'GET', path: '/v1/me' });
  expect(before.status()).toBe(200);
  const current = z.object({ version: z.number() }).parse(await before.json());
  await profile.getByLabel('显示名称').fill('Preserved local draft');
  const concurrent = await bffRequest(page, {
    method: 'PATCH',
    path: '/v1/me',
    data: {
      version: current.version,
      displayName: 'Concurrent server name',
    },
  });
  expect(concurrent.status()).toBe(200);
  expectHttp(page, browserErrors, { method: 'PATCH', path: '/v1/me', status: 409 });
  const conflict = waitForApi(page, 'PATCH', '/v1/me');
  await profile.getByRole('button', { name: '保存资料', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(profile.getByLabel('显示名称')).toHaveValue('Preserved local draft');
  await expect(profile.getByRole('button', { name: '保存资料', exact: true })).toBeDisabled();
  await profile.getByRole('button', { name: '读取当前资料', exact: true }).click();
  await expect(
    profile.getByText('当前服务端名称: Concurrent server name', { exact: true }),
  ).toBeVisible();
  await profile.getByRole('button', { name: '按当前版本继续编辑', exact: true }).click();
  await expect(profile.getByLabel('显示名称')).toHaveValue('Preserved local draft');
  saved = waitForApi(page, 'PATCH', '/v1/me');
  await profile.getByRole('button', { name: '保存资料', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(profile.getByText('个人资料已保存。', { exact: true })).toBeVisible();
  const session = (await context.cookies()).find((cookie) => cookie.name === 'oneaster-session');
  if (!session) throw new Error('Password revocation requires a real authenticated session.');
  await profile.getByLabel('显示名称').fill('Unsaved during password change');
  const password = page.getByRole('form', { name: '修改密码', exact: true });
  const nextPassword = 'Browser changed password 2026';
  await password.getByLabel(/^当前密码/).fill(applicationAccounts.owner.password);
  await password.getByLabel(/^新密码/).fill(nextPassword);
  await password.getByLabel(/^确认新密码/).fill(nextPassword);
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.accept();
  });
  const changed = waitForApi(page, 'PUT', '/v1/me/password');
  await password.getByRole('button', { name: '修改密码并重新登录', exact: true }).click();
  expect((await changed).status()).toBe(204);
  await expect(page).toHaveURL(/\/login$/);
  expect(
    dialogs,
    'A successful password change must return to sign in without a stale profile beforeunload prompt.',
  ).toEqual([]);
  const apiOrigins = (process.env.CMS_ADMIN_E2E_API_ORIGINS ?? '').split(',');
  const apiOrigin = apiOrigins[test.info().project.name === 'development' ? 0 : 1];
  const revoked = await fetch(`${apiOrigin}/v1/me`, {
    headers: { authorization: `Bearer ${session.value}` },
    signal: AbortSignal.timeout(10000),
  });
  expect(revoked.status).toBe(401);
  expectHttp(page, browserErrors, { method: 'POST', path: '/v1/auth/login', status: 401 });
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(401);
  expect(
    (
      await loginManagement(page, { ...applicationAccounts.owner, password: nextPassword })
    ).status(),
  ).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Preserved local draft', { exact: true }).first()).toBeVisible();
});
