import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { pendingManagementAccount } from '../test/support/admin-management-fixture.ts';
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

test('a pending administrator role change invalidates the old invitation and explicit reinvitation delivers a new usable SMTP link', async ({
  page,
  browser,
  baseURL,
}) => {
  const mailbox = managementMailbox(test.info().project.name);
  const original = await mailbox.link({
    after: 0,
    recipient: pendingManagementAccount.email,
    path: '/accept-invitation',
    frontendOrigin: new URL(baseURL ?? '').origin,
  });
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const role = await createRoleInUi(page, 'browser_pending', 'Browser pending role');
  const response = await bffRequest(page, {
    method: 'GET',
    path: `/v1/admins?q=${encodeURIComponent(pendingManagementAccount.email)}`,
  });
  expect(response.status()).toBe(200);
  const [pending] = z
    .object({
      rows: z.array(z.object({ id: z.uuid(), activation: z.literal('pending') })).length(1),
    })
    .parse(await response.json()).rows;
  if (!pending) throw new Error('The pending administrator must exist before reinvitation.');
  await page.goto(`/dashboard/admins/${pending.id}`);
  const form = page.getByRole('form', { name: '账户资料', exact: true });
  await form.getByLabel(/^角色/).selectOption(role.id);
  await form.getByRole('button', { name: '保存资料', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '确认角色或状态变更', exact: true });
  const changed = waitForApi(page, 'PATCH', `/v1/admins/${pending.id}`);
  await confirmation.getByRole('button', { name: '确认变更', exact: true }).click();
  expect((await changed).status()).toBe(200);
  await expect(confirmation).toHaveCount(0);
  await expect(
    page.getByText(
      '角色或状态变化已撤销全部会话和未消费的邀请、重置链接。待激活用户需要显式重新邀请。',
      { exact: true },
    ),
  ).toBeVisible();
  const guest = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const guestPage = await guest.newPage();
  const guestErrors = observeBrowserErrors(guestPage);
  try {
    await guestPage.goto(original);
    expectHttp(guestPage, guestErrors, {
      method: 'POST',
      path: '/v1/auth/invitation-acceptances',
      status: 400,
    });
    expect(
      (await passwordAction(guestPage, pendingManagementAccount.password, 'invitation')).status(),
    ).toBe(400);
    await expect(
      guestPage.getByText('链接无效、已过期或已使用。请申请新链接。', { exact: true }),
    ).toBeVisible();
    const before = (await mailbox.messages()).length;
    const invited = waitForApi(page, 'POST', `/v1/admins/${pending.id}/invitations`);
    await page.getByRole('button', { name: '重新发送邀请', exact: true }).click();
    expect((await invited).status()).toBe(201);
    await expect(
      page.getByText('邀请请求已完成，旧邀请链接失效；投递状态如下。', { exact: true }),
    ).toBeVisible();
    const next = await mailbox.link({
      after: before,
      recipient: pendingManagementAccount.email,
      path: '/accept-invitation',
      frontendOrigin: new URL(baseURL ?? '').origin,
    });
    expect(next).not.toBe(original);
    await guestPage.goto('/login');
    await guestPage.goto(next);
    expect(
      (await passwordAction(guestPage, pendingManagementAccount.password, 'invitation')).status(),
    ).toBe(204);
    await expect(
      guestPage.getByText('账户已激活。请使用新密码登录。', { exact: true }),
    ).toBeVisible();
    expect((await loginManagement(guestPage, pendingManagementAccount)).status()).toBe(200);
    await expect(guestPage).toHaveURL(/\/dashboard$/);
    await expect(
      guestPage.getByText(pendingManagementAccount.email, { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: '刷新用户', exact: true }).click();
    await expect(page.getByText('已激活', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '重新发送邀请', exact: true })).toHaveCount(0);
    await expect(form.getByLabel(/^角色/)).toHaveValue(role.id);
  } finally {
    await guest.close();
    expect(
      guestErrors.issues(),
      'Invitation recipients must have no unexpected browser errors.',
    ).toEqual([]);
  }
});
