import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { observeBrowserErrors } from '../test/support/browser-errors.ts';
import {
  bffRequest,
  createRoleInUi,
  expectHttp,
  loginManagement,
  managementMailbox,
  passwordAction,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

test('administrator role and status updates require confirmation and revoke real sessions and unused reset links while own security fields stay protected', async ({
  page,
  browser,
  baseURL,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const role = await createRoleInUi(page, 'browser_changed', 'Browser changed role');
  const principalResponse = await bffRequest(page, { method: 'GET', path: '/v1/me' });
  expect(principalResponse.status()).toBe(200);
  const principal = z.object({ id: z.uuid() }).parse(await principalResponse.json());
  await page.goto(`/dashboard/admins/${principal.id}`);
  const ownerForm = page.getByRole('form', { name: '账户资料', exact: true });
  await expect(ownerForm.getByLabel(/^角色/)).toBeDisabled();
  await expect(ownerForm.getByLabel(/^状态/)).toBeDisabled();
  await expect(ownerForm.getByText('不能修改自己的角色或状态。', { exact: true })).toBeVisible();
  const accounts = await bffRequest(page, {
    method: 'GET',
    path: `/v1/admins?q=${encodeURIComponent(applicationAccounts.reader.email)}`,
  });
  expect(accounts.status()).toBe(200);
  const [target] = z
    .object({ rows: z.array(z.object({ id: z.uuid(), email: z.email() })).length(1) })
    .parse(await accounts.json()).rows;
  if (!target)
    throw new Error('The isolated application fixture must contain its real activated reader.');
  const targetContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const targetPage = await targetContext.newPage();
  const targetErrors = observeBrowserErrors(targetPage);
  try {
    expect((await loginManagement(targetPage, applicationAccounts.reader)).status()).toBe(200);
    await expect(targetPage).toHaveURL(/\/dashboard$/);
    const mailbox = managementMailbox(test.info().project.name);
    const before = (await mailbox.messages()).length;
    await targetPage.goto('/forgot-password');
    await targetPage.getByLabel(/^邮箱/).fill(target.email);
    const requestReset = waitForApi(targetPage, 'POST', '/v1/auth/password-reset-requests');
    await targetPage.getByRole('button', { name: '申请重置链接', exact: true }).click();
    expect((await requestReset).status()).toBe(202);
    const reset = await mailbox.link({
      after: before,
      recipient: target.email,
      path: '/reset-password',
      frontendOrigin: new URL(baseURL ?? '').origin,
    });
    await page.goto(`/dashboard/admins/${target.id}`);
    const form = page.getByRole('form', { name: '账户资料', exact: true });
    await form.getByLabel(/^角色/).selectOption(role.id);
    await form.getByRole('button', { name: '保存资料', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: '确认角色或状态变更', exact: true });
    await expect(confirmation).toContainText(target.email);
    await expect(confirmation).toContainText('Browser changed role');
    const changed = waitForApi(page, 'PATCH', `/v1/admins/${target.id}`);
    await confirmation.getByRole('button', { name: '确认变更', exact: true }).click();
    expect((await changed).status()).toBe(200);
    await expect(confirmation).toHaveCount(0);
    expect((await bffRequest(targetPage, { method: 'GET', path: '/v1/me' })).status()).toBe(401);
    await targetPage.goto(reset);
    expectHttp(targetPage, targetErrors, {
      method: 'POST',
      path: '/v1/auth/password-resets',
      status: 400,
    });
    expect(
      (await passwordAction(targetPage, 'Revoked reset password 2026', 'reset')).status(),
    ).toBe(400);
    await expect(
      targetPage.getByText('链接无效、已过期或已使用。请申请新链接。', { exact: true }),
    ).toBeVisible();
    const operationsReady = waitForApi(targetPage, 'GET', '/v1/me/operations');
    const navigationReady = waitForApi(targetPage, 'GET', '/v1/me/navigation');
    expect((await loginManagement(targetPage, applicationAccounts.reader)).status()).toBe(200);
    await expect(targetPage).toHaveURL(/\/dashboard$/);
    expect((await operationsReady).status()).toBe(200);
    expect((await navigationReady).status()).toBe(200);
    await page.getByRole('button', { name: '刷新用户', exact: true }).click();
    await expect(form.getByLabel(/^状态/)).toBeEnabled();
    await form.getByLabel(/^状态/).selectOption('disabled');
    await form.getByRole('button', { name: '保存资料', exact: true }).click();
    const disabling = waitForApi(page, 'PATCH', `/v1/admins/${target.id}`);
    await confirmation.getByRole('button', { name: '确认变更', exact: true }).click();
    expect((await disabling).status()).toBe(200);
    await expect(confirmation).toHaveCount(0);
    expect((await bffRequest(targetPage, { method: 'GET', path: '/v1/me' })).status()).toBe(401);
    expectHttp(targetPage, targetErrors, { method: 'POST', path: '/v1/auth/login', status: 401 });
    expect((await loginManagement(targetPage, applicationAccounts.reader)).status()).toBe(401);
    await expect(
      targetPage.getByRole('form', { name: '管理员登录', exact: true }).getByRole('alert'),
    ).toContainText('邮箱或密码不正确。');
    await expect(form.getByLabel(/^角色/)).toHaveValue(role.id);
    await expect(form.getByLabel(/^状态/)).toHaveValue('disabled');
  } finally {
    await targetContext.close();
    expect(
      targetErrors.issues(),
      'The affected administrator browser must have no unexpected errors.',
    ).toEqual([]);
  }
});
