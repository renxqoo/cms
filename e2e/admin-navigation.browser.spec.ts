import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';

test('navigation creates a legal group/page/action tree, links a registered route and hides disabled ancestors', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/navigation');
  const created: { id: string; name: string }[] = [];
  for (const node of [
    { name: 'Browser workspace', type: 'group' },
    { name: 'Browser users', type: 'page' },
    { name: 'Browser invite action', type: 'action' },
  ]) {
    await page.getByRole('button', { name: '创建节点', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '创建节点', exact: true });
    await dialog.getByLabel(/^名称/).fill(node.name);
    await dialog.getByLabel('类型', { exact: true }).selectOption(node.type);
    if (node.type === 'page') {
      await dialog.getByLabel(/^父级节点/).selectOption({ label: 'Browser workspace' });
      await dialog.getByLabel(/^页面路径/).selectOption('/dashboard/admins');
      await dialog.getByLabel('图标', { exact: true }).selectOption('users');
    } else if (node.type === 'action') {
      await dialog.getByLabel(/^父级节点/).selectOption({ label: 'Browser users' });
      await expect(dialog.getByLabel(/^页面路径/)).toHaveCount(0);
      await expect(dialog.getByLabel('图标', { exact: true })).toHaveCount(0);
    }
    const saving = await captureApiJson(
      page,
      { method: 'POST', path: '/v1/navigation', status: 201 },
      z.object({ id: z.uuid() }),
    );
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    created.push({ ...(await saving.read()), name: node.name });
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: `操作: ${node.name}`, exact: true }),
    ).toBeVisible();
  }
  const link = page.getByRole('link', { name: 'Browser users', exact: true });
  await expect(link).toHaveAttribute('href', '/dashboard/admins');
  await expect(page.getByRole('link', { name: 'Browser invite action', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: '操作: Browser workspace', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: '删除节点', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('menuitem', { name: '编辑节点', exact: true }).click();
  const edit = page.getByRole('dialog', { name: '编辑节点', exact: true });
  await expect(edit.getByLabel('类型', { exact: true })).toBeDisabled();
  await edit.getByLabel('状态', { exact: true }).selectOption('disabled');
  const [group] = created;
  if (!group) throw new Error('The UI must create the group before its children.');
  const changed = waitForApi(page, 'PATCH', `/v1/navigation/${group.id}`);
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  expect((await changed).status()).toBe(200);
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Browser users', exact: true })).toHaveCount(0);
  await expect(page.getByText('祖先已停用', { exact: true })).toHaveCount(2);
  const navigation = await bffRequest(page, { method: 'GET', path: '/v1/navigation' });
  expect(navigation.status()).toBe(200);
  const tree = z
    .object({
      rows: z.array(
        z.object({
          id: z.uuid(),
          status: z.string(),
          children: z.array(
            z.object({
              name: z.string(),
              path: z.string().nullable(),
              icon: z.string().nullable(),
              children: z.array(z.object({ name: z.string(), path: z.null() })),
            }),
          ),
        }),
      ),
    })
    .parse(await navigation.json());
  expect(tree.rows.find((row) => row.id === group.id)).toMatchObject({
    status: 'disabled',
    children: [
      {
        name: 'Browser users',
        path: '/dashboard/admins',
        icon: 'users',
        children: [{ name: 'Browser invite action', path: null }],
      },
    ],
  });
  for (const node of created.toReversed()) {
    await page.getByRole('button', { name: `操作: ${node.name}`, exact: true }).click();
    await page.getByRole('menuitem', { name: '删除节点', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: new RegExp(`删除节点: ${node.name}`) });
    const deleted = waitForApi(page, 'DELETE', `/v1/navigation/${node.id}`);
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
    expect((await deleted).status()).toBe(204);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: `操作: ${node.name}`, exact: true })).toHaveCount(
      0,
    );
  }
});
