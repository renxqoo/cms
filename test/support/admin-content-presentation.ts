import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { applicationAccounts } from './admin-application-data.ts';
import { loginManagement, test } from './admin-browser-management.ts';

const pages = [
  { path: '/dashboard/collections', zh: '内容集合', en: 'Collections' },
  { path: '/dashboard/resources', zh: '资源管理', en: 'Resources' },
  { path: '/dashboard/jobs', zh: '任务与上传', en: 'Jobs and uploads' },
  { path: '/dashboard/asset-cleanups', zh: '资源清理', en: 'Asset cleanups' },
] as const;

async function verifyPresentation(page: Page, width: number, screenshot: string) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const action = page.locator('main button:visible').first();
  await expect(action).toBeEnabled();
  await action.focus();
  await expect(action).toBeFocused();
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(viewport.content).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({
    path: test.info().outputPath(screenshot),
    fullPage: true,
    animations: 'disabled',
    caret: 'initial',
  });
}

export function contentPresentationCases(locale: 'zh' | 'en') {
  for (const theme of ['light', 'dark'] as const) {
    test(`content management ${locale}/${theme} remains readable and keyboard accessible at 1440px and 390px`, async ({
      page,
      context,
      baseURL,
    }) => {
      expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
      await expect(page).toHaveURL(/\/dashboard$/);
      await context.addCookies([
        { name: 'oneaster-locale', value: locale, url: new URL('/', baseURL).href },
        { name: 'oneaster-theme', value: theme, url: new URL('/', baseURL).href },
      ]);
      for (const entry of pages) {
        const data = page.waitForResponse((response) => {
          const { pathname } = new URL(response.url());
          return (
            response.request().method() === 'GET' &&
            pathname.startsWith('/api/cms/v1/') &&
            !pathname.startsWith('/api/cms/v1/me') &&
            response.status() === 200
          );
        });
        await page.goto(entry.path);
        await data;
        await expect(page.getByRole('heading', { name: entry[locale], exact: true })).toBeVisible();
        await expect(
          page.getByText(/^(正在加载…|Loading…|正在读取内容…|Loading content…)$/),
        ).toHaveCount(0);
        if (entry.path === '/dashboard/resources')
          await expect(
            page.getByRole('button', {
              name: locale === 'zh' ? '选择文件' : 'Choose files',
              exact: true,
            }),
          ).toBeVisible();
        await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
        for (const width of [1440, 390])
          await verifyPresentation(page, width, `${entry.path.split('/').at(-1)}-${width}.png`);
      }
    });
  }
}
