import { expect } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  expectHttp,
  loginManagement,
  managementMailbox,
  passwordAction,
  signOutManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

test('UI invitation and password reset consume real SMTP URLs once and permit the new password to sign in', async ({
  page,
  baseURL,
  browserErrors,
}) => {
  const mailbox = managementMailbox(test.info().project.name);
  const account = {
    email: 'browser-invited@example.test',
    password: 'Browser invitation password 2026',
    displayName: 'Browser invited administrator',
  };
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/admins');
  await expect(page.getByRole('heading', { name: '用户管理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '邀请用户', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '邀请管理员', exact: true });
  await dialog.getByLabel(/^邮箱/).fill(account.email);
  await dialog.getByLabel('显示名称', { exact: true }).fill(account.displayName);
  await dialog
    .getByLabel(/^角色/)
    .selectOption({ label: 'Application reader (application_reader)' });
  const beforeInvitation = (await mailbox.messages()).length;
  const created = waitForApi(page, 'POST', '/v1/admins');
  await dialog.getByRole('button', { name: '创建并邀请', exact: true }).click();
  expect((await created).status()).toBe(201);
  await expect(
    dialog.getByText('账户已创建。以下为真实邀请投递状态，不代表邮件最终送达。', { exact: true }),
  ).toBeVisible();
  const invitation = await mailbox.link({
    after: beforeInvitation,
    recipient: account.email,
    path: '/accept-invitation',
    frontendOrigin: new URL(baseURL ?? '').origin,
  });
  await dialog.getByRole('link', { name: '查看详情', exact: true }).click();
  await expect(page.getByText('SMTP 已接受', { exact: true })).toBeVisible();
  await signOutManagement(page);
  await page.goto(invitation);
  expect((await passwordAction(page, account.password, 'invitation')).status()).toBe(204);
  await expect(page.getByText('账户已激活。请使用新密码登录。', { exact: true })).toBeVisible();
  await page.goto('/login');
  await page.goto(invitation);
  expectHttp(page, browserErrors, {
    method: 'POST',
    path: '/v1/auth/invitation-acceptances',
    status: 400,
  });
  expect((await passwordAction(page, account.password, 'invitation')).status()).toBe(400);
  await expect(
    page.getByText('链接无效、已过期或已使用。请申请新链接。', { exact: true }),
  ).toBeVisible();
  expect((await loginManagement(page, account)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await signOutManagement(page);
  await page.goto('/forgot-password');
  await page.getByLabel(/^邮箱/).fill(account.email);
  const beforeReset = (await mailbox.messages()).length;
  const requested = waitForApi(page, 'POST', '/v1/auth/password-reset-requests');
  await page.getByRole('button', { name: '申请重置链接', exact: true }).click();
  expect((await requested).status()).toBe(202);
  await expect(
    page.getByText(
      '请求已接受。如果邮箱对应可重置的账户，系统将尝试发送邮件；这不表示邮件已经送达。',
      { exact: true },
    ),
  ).toBeVisible();
  const reset = await mailbox.link({
    after: beforeReset,
    recipient: account.email,
    path: '/reset-password',
    frontendOrigin: new URL(baseURL ?? '').origin,
  });
  const nextPassword = 'Browser reset password 2026';
  await page.goto(reset);
  expect((await passwordAction(page, nextPassword, 'reset')).status()).toBe(204);
  await expect(
    page.getByText('密码已重置，原会话已撤销。请使用新密码登录。', { exact: true }),
  ).toBeVisible();
  await page.goto('/login');
  await page.goto(reset);
  expectHttp(page, browserErrors, {
    method: 'POST',
    path: '/v1/auth/password-resets',
    status: 400,
  });
  expect((await passwordAction(page, nextPassword, 'reset')).status()).toBe(400);
  await expect(
    page.getByText('链接无效、已过期或已使用。请申请新链接。', { exact: true }),
  ).toBeVisible();
  expectHttp(page, browserErrors, { method: 'POST', path: '/v1/auth/login', status: 401 });
  expect((await loginManagement(page, account)).status()).toBe(401);
  expect((await loginManagement(page, { ...account, password: nextPassword })).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(account.email, { exact: true }).first()).toBeVisible();
});
