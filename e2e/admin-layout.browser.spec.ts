import { expect } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test } from '../test/support/admin-browser-management.ts';
import {
  expectNarrowManagementLayout,
  grantContentOperations,
  trackContentRequests,
  waitForContent,
} from '../test/support/admin-content-browser.ts';

const entries = [
  { path: '/dashboard', title: { zh: '概览', en: 'Dashboard' } },
  { path: '/dashboard/account', title: { zh: '账户设置', en: 'Account settings' }, capture: true },
  {
    path: '/dashboard/admins',
    title: { zh: '用户管理', en: 'Users' },
    capture: true,
    ready: '/v1/admins',
  },
  {
    path: '/dashboard/roles',
    title: { zh: '角色管理', en: 'Roles' },
    capture: true,
    ready: '/v1/roles',
  },
  { path: '/dashboard/permissions', title: { zh: '权限管理', en: 'Permissions' } },
  { path: '/dashboard/navigation', title: { zh: '导航管理', en: 'Navigation' } },
  { path: '/dashboard/endpoints', title: { zh: '接口管理', en: 'Endpoints' } },
  { path: '/dashboard/access-recovery', title: { zh: '访问恢复', en: 'Access recovery' } },
  { path: '/dashboard/audit-logs', title: { zh: '审计日志', en: 'Audit logs' } },
  {
    path: '/dashboard/collections',
    title: { zh: '内容集合', en: 'Collections' },
    capture: true,
    ready: '/v1/collections',
  },
  {
    path: '/dashboard/resources',
    title: { zh: '资源库', en: 'Resources' },
    capture: true,
    ready: '/v1/resources',
  },
  { path: '/dashboard/jobs', title: { zh: '任务与上传', en: 'Jobs and uploads' } },
  { path: '/dashboard/asset-cleanups', title: { zh: '资源清理', en: 'Asset cleanup' } },
] as const;

test('every actual administration entry fits 390px and key screens switch both languages and themes without refetching their data', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: 'oneaster-locale', value: 'zh', url: new URL('/', baseURL).href },
    { name: 'oneaster-theme', value: 'light', url: new URL('/', baseURL).href },
  ]);
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  for (const collection of ['articles', 'media']) {
    await grantContentOperations(page, {
      collection,
      operations: ['collections.get', 'documents.list'],
    });
  }
  const requests = trackContentRequests(page);
  await page.setViewportSize({ width: 390, height: 844 });
  let locale: 'zh' | 'en' = 'zh';
  let theme: 'light' | 'dark' = 'light';
  for (const entry of entries) {
    const initialReads = [
      waitForContent(page, { method: 'GET', path: '/v1/me/operations', query: { page: '1' } }),
      waitForContent(page, { method: 'GET', path: '/v1/me/navigation' }),
    ];
    if ('ready' in entry)
      initialReads.push(waitForContent(page, { method: 'GET', path: entry.ready }));
    await page.goto(entry.path);
    for (const response of await Promise.all(initialReads)) expect(response.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: entry.title[locale], exact: true }),
    ).toBeVisible();
    for (const table of await page.getByRole('table').all())
      await expect(table).not.toHaveAttribute('aria-busy', 'true');
    await requests.settle();
    await expectNarrowManagementLayout(page);
    if (!('capture' in entry)) continue;
    for (const nextLocale of ['zh', 'en'] as const) {
      for (const nextTheme of ['light', 'dark'] as const) {
        const before = requests.completed.length;
        if (locale !== nextLocale) {
          await page
            .getByRole('button', {
              name: locale === 'zh' ? '切换语言' : 'Switch language',
              exact: true,
            })
            .click();
          locale = nextLocale;
        }
        if (theme !== nextTheme) {
          await page
            .getByRole('button', {
              name: locale === 'zh' ? '切换主题' : 'Toggle theme',
              exact: true,
            })
            .click();
          theme = nextTheme;
        }
        await expect(
          page.getByRole('heading', { name: entry.title[locale], exact: true }),
        ).toBeVisible();
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        await requests.settle();
        expect(
          requests.completed.length,
          'Language and theme switches must reuse the current data.',
        ).toBe(before);
        await expectNarrowManagementLayout(page);
        await page.screenshot({
          path: test
            .info()
            .outputPath(`${entry.path.split('/').at(-1)}-390-${locale}-${theme}.png`),
          fullPage: true,
          animations: 'disabled',
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({
          path: test
            .info()
            .outputPath(`${entry.path.split('/').at(-1)}-1440-${locale}-${theme}.png`),
          fullPage: true,
          animations: 'disabled',
        });
        if (entry.path === '/dashboard/admins' && locale === 'zh' && theme === 'light') {
          const roles = waitForContent(page, { method: 'GET', path: '/v1/roles' });
          await page.getByRole('button', { name: '邀请用户', exact: true }).click();
          expect((await roles).status()).toBe(200);
          const invite = page.getByRole('dialog');
          await expect(invite.getByRole('combobox', { name: /^角色/ })).toBeEnabled();
          await page.screenshot({
            path: test.info().outputPath('admin-invitation-1440-zh-light.png'),
            fullPage: true,
            animations: 'disabled',
          });
          await invite.getByRole('button', { name: '取消', exact: true }).click();
          await expect(invite).toHaveCount(0);
          await requests.settle();
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
    }
  }
  expect(requests.completed.filter((request) => request.status === 429)).toEqual([]);
  expect(requests.completed.length).toBeLessThan(110);
});
