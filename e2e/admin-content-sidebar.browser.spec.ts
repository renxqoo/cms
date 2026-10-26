import { expect } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';

test('collection sidebar opens lists directly, highlights editor parents and preserves guarded navigation on desktop and mobile', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const sidebar = page.getByRole('complementary', { name: '导航菜单', exact: true });
  const articles = sidebar.getByRole('link', { name: 'Articles', exact: true });
  await expect(articles).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Site settings', exact: true })).toHaveAttribute(
    'href',
    '/dashboard/collections/settings',
  );
  await sidebar.getByRole('button', { name: '收起内容集合', exact: true }).click();
  await expect(articles).toHaveCount(0);
  const expand = sidebar.getByRole('button', { name: '展开内容集合', exact: true });
  await expand.focus();
  await page.keyboard.press('Enter');
  await articles.click();
  await expect(page).toHaveURL(/\/dashboard\/collections\/articles$/);
  await expect(articles).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Articles · 当前文档', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '新建文档', exact: true }).click();
  await expect(page).toHaveURL(/\/articles\/new\?locale=en$/);
  await expect(articles).toHaveAttribute('aria-current', 'page');
  const title = page.getByRole('textbox', { name: /^title/ });
  await title.fill('Keep this unsaved draft');
  await sidebar.getByRole('link', { name: 'Pages', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '离开未保存的编辑？', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(title).toHaveValue('Keep this unsaved draft');
  await sidebar.getByRole('link', { name: 'Pages', exact: true }).click();
  await confirmation.getByRole('button', { name: '离开', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/collections\/pages$/);
  await page.getByRole('button', { name: '切换侧栏', exact: true }).click();
  await expect(sidebar.getByRole('link', { name: 'Pages', exact: true })).toHaveAttribute(
    'title',
    'Pages',
  );
  await page.getByRole('button', { name: '切换侧栏', exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath('collection-menu-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '切换侧栏', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '导航菜单', exact: true });
  await expect(drawer).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('collection-menu-mobile.png'),
    animations: 'disabled',
  });
  await drawer.getByRole('link', { name: 'Articles', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/collections\/articles$/);
  await expect(drawer).toHaveCount(0);
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
});
