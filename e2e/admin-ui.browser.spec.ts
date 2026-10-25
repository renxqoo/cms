import { expect, test } from '@playwright/test';

let browserErrors: string[] = [];

test.beforeEach(({ page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
});

test.afterEach(() => {
  expect(browserErrors, 'The page must render and hydrate without runtime errors.').toEqual([]);
});

test('regression: date text hydrates identically on the server and browser', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'oneaster-locale',
      value: 'en',
      url: new URL('/', test.info().project.use.baseURL).href,
    },
  ]);
  await page.goto('/ui/lists');
  await expect(page.getByRole('heading', { name: 'Content list' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search content', exact: true }).fill('OneAster');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/q=OneAster/);
});

test('opens the OneAster workbench and composed list directly', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ui$/);
  await expect(page.getByRole('heading', { name: 'UI 组件工作台' })).toBeVisible();
  await page.getByRole('link', { name: '打开场景', exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/lists$/);
  await expect(page.getByRole('heading', { name: '内容列表' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('欢迎使用 OneAster', { exact: true })).toBeVisible();
});

test('search preserves filtering and browser history restores the prior search', async ({
  page,
}) => {
  await page.goto('/ui/lists?status=draft&pageSize=5');
  const search = page.getByRole('searchbox', { name: '搜索内容', exact: true });
  await search.fill('媒体');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page).toHaveURL(/q=/);
  expect(new URL(page.url()).searchParams.get('status')).toBe('draft');
  await expect(page.getByText('媒体资源管理', { exact: true })).toBeVisible();
  await expect(page.getByText('内容编辑指南', { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(search).toHaveValue('');
  await expect(page.getByText('内容编辑指南', { exact: true })).toBeVisible();
});

test('regression: pending navigation preserves both a rapid search and filter', async ({
  page,
}) => {
  await page.goto('/ui/lists?pageSize=5');
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/ui\/lists\?/, async (route) => {
    await blocked;
    await route.continue();
  });
  const request = page.waitForRequest(
    (candidate) => new URL(candidate.url()).searchParams.get('q') === '媒体',
  );
  try {
    await page.getByRole('searchbox', { name: '搜索内容', exact: true }).fill('媒体');
    await page.getByRole('button', { name: '搜索', exact: true }).click({ noWaitAfter: true });
    await request;
    await page.getByRole('combobox', { name: '按状态筛选' }).selectOption('draft');
  } finally {
    release?.();
  }
  await expect(page).toHaveURL(/status=draft/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('媒体');
  await expect(page.getByText('媒体资源管理', { exact: true })).toBeVisible();
  await expect(page.getByText('内容编辑指南', { exact: true })).toHaveCount(0);
});

test('form dialog validates and applies a local example with keyboard focus restored', async ({
  page,
}) => {
  await page.goto('/ui/lists');
  const trigger = page.getByRole('button', { name: '添加本地示例', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '添加本地示例' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '应用到本地示例' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('内容标题').fill('浏览器验收条目');
  await dialog.getByLabel('分类', { exact: true }).fill('验收');
  await dialog.getByRole('button', { name: '应用到本地示例' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('浏览器验收条目', { exact: true })).toBeVisible();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('language and theme survive reload and narrow-screen navigation stays usable', async ({
  page,
}) => {
  await page.goto('/ui/lists');
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Content list' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', { name: 'Content list' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
