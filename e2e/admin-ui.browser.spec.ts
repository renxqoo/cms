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
  await page.goto('/ui');
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

declare global {
  interface Window {
    monaco?: {
      editor: {
        getModels(): { getValue(): string }[];
      };
    };
  }
}

test('all seven component categories render directly in both languages', async ({ page }) => {
  const categories = [
    ['actions', '操作与导航', 'Actions and navigation'],
    ['inputs', '输入与选择', 'Inputs and selection'],
    ['layout', '布局与结构', 'Layout and structure'],
    ['feedback', '反馈与状态', 'Feedback and status'],
    ['data', '数据与列表', 'Data and lists'],
    ['overlays', '交互与覆盖层', 'Interaction and overlays'],
    ['documents', '文档、关系与媒体', 'Documents, relationships and media'],
  ] as const;
  for (const [path, chinese, english] of categories) {
    await page.goto(`/ui/${path}`);
    await expect(page.getByRole('heading', { name: chinese, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: '切换语言', exact: true }).click();
    await expect(page.getByRole('heading', { name: english, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Switch language', exact: true }).click();
  }
});

test('real local Monaco edits isolated models, preserves theme and disposes models on navigation', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const { origin } = new URL(test.info().project.use.baseURL ?? '');
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== origin) externalRequests.push(url.href);
  });
  await page.goto('/ui/inputs');
  const editor = page.getByRole('textbox', { name: 'JSON 代码', exact: true });
  await expect(editor).toBeAttached();
  await page.getByRole('region', { name: 'JSON 代码', exact: true }).scrollIntoViewIfNeeded();
  await editor.focus();
  await expect(editor).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.monaco?.editor.getModels().length)).toBe(2);
  await page.getByRole('region', { name: 'JSON 代码', exact: true }).locator('.view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText('{"accepted":true}');
  await expect(page.getByLabel('当前代码值', { exact: true })).toHaveText('{"accepted":true}');
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await expect(page.locator('.monaco-editor.vs-dark')).toHaveCount(2);
  await page.getByRole('button', { name: '设为只读', exact: true }).click();
  await page.getByRole('region', { name: 'JSON 代码', exact: true }).locator('.view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('must not replace');
  await expect(page.getByLabel('当前代码值', { exact: true })).toHaveText('{"accepted":true}');
  expect(
    await page.evaluate(() =>
      window.monaco?.editor
        .getModels()
        .map((model) => model.getValue())
        .toSorted(),
    ),
  ).toEqual(['{"accepted":true}', 'export const cms = "OneAster";'].toSorted());
  const height = await page.locator('.monaco-editor').first().boundingBox();
  expect(height?.height).toBeGreaterThanOrEqual(160);
  expect(height?.height).toBeLessThanOrEqual(320);
  await page.getByRole('link', { name: '数据与列表', exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/data$/);
  await expect.poll(() => page.evaluate(() => window.monaco?.editor.getModels().length)).toBe(0);
  expect(externalRequests).toEqual([]);
});

test('keyboard sorting applies real order while Escape cancels', async ({ page }) => {
  await page.goto('/ui/data');
  const list = page.getByRole('list', { name: '可拖拽与键盘排序', exact: true });
  const first = list.getByRole('button', { name: '移动欢迎使用 OneAster', exact: true });
  await list.scrollIntoViewIfNeeded();
  await expect(first).toHaveAttribute('aria-roledescription', '可排序项目');
  await first.focus();
  await page.keyboard.press('Space', { delay: 80 });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown', { delay: 80 });
  await expect(page.getByRole('status').filter({ hasText: '移至第 2 项' })).toBeVisible();
  await page.keyboard.press('Space', { delay: 80 });
  await expect(list.getByRole('listitem').first()).toHaveText('内容编辑指南');
  await first.focus();
  await page.keyboard.press('Space', { delay: 80 });
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown', { delay: 80 });
  await expect(page.getByRole('status').filter({ hasText: '移至第 3 项' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list.getByRole('listitem').nth(1)).toHaveText('欢迎使用 OneAster');
  await page.getByRole('checkbox', { name: '禁用全部排序', exact: true }).check();
  await expect(first).toBeDisabled();
});

test('unapplied document changes guard links and preserve the browser back and forward journey', async ({
  page,
}) => {
  await page.goto('/ui/lists');
  await page.getByRole('link', { name: '文档与上传', exact: true }).click();
  await page.getByRole('textbox', { name: '标题', exact: true }).fill('浏览器尚未应用');
  const title = page.getByRole('textbox', { name: '标题', exact: true });
  await page.getByRole('link', { name: '数据与列表', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '有尚未应用的本地修改' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/documents$/);
  await expect(title).toHaveValue('浏览器尚未应用');
  await page.goBack();
  await expect(confirmation).toBeVisible();
  await expect(page).toHaveURL(/\/ui\/documents$/);
  await confirmation.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(title).toHaveValue('浏览器尚未应用');
  await page.goBack();
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: '离开页面', exact: true }).click();
  await expect(page).toHaveURL(/\/ui\/lists$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/ui\/documents$/);
  await expect(title).toHaveValue('OneAster draft');
});

test('upload queues enforce budgets and expose progress, cancel and retry without sending files', async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') uploads.push(request.url());
  });
  await page.goto('/ui/documents');
  const region = page.getByRole('region', { name: '文件编辑', exact: true });
  const chooser = region.locator('input[type="file"]').first();
  await chooser.setInputFiles({
    name: 'browser-acceptance.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('local acceptance'),
  });
  await expect(region.getByText('browser-acceptance.txt', { exact: true }).first()).toBeVisible();
  await expect(region.getByText('本地队列，未发送', { exact: true })).toBeVisible();
  await region.getByRole('button', { name: '查看合成进度状态', exact: true }).click();
  await expect(region.getByRole('progressbar')).toHaveAttribute('value', '45');
  await region.getByRole('button', { name: '取消 browser-acceptance.txt', exact: true }).click();
  await expect(region.getByText('已取消本地操作', { exact: true })).toBeVisible();
  await region
    .getByRole('button', { name: '重试事件 browser-acceptance.txt', exact: true })
    .click();
  await expect(region.getByText('本地队列，未发送', { exact: true })).toBeVisible();
  await chooser.setInputFiles({
    name: 'unsupported.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('invalid'),
  });
  await expect(region.getByRole('status', { name: '最近的本地事件' })).toContainText(
    'unsupported.exe: 不支持该文件类型',
  );
  await region.getByRole('button', { name: '移除 browser-acceptance.txt', exact: true }).click();
  await expect(region.getByText('browser-acceptance.txt', { exact: true })).toHaveCount(0);
  expect(uploads).toEqual([]);
});

test('image adjustment controls output clamped crop and focal coordinates', async ({ page }) => {
  await page.goto('/ui/documents');
  const region = page.getByRole('region', { name: '图片尺寸与调整', exact: true });
  await region.getByLabel('裁剪宽度', { exact: true }).fill('0.25');
  await region.getByLabel('焦点 X', { exact: true }).fill('0.75');
  await region.getByRole('button', { name: '输出本地调整参数', exact: true }).click();
  const output = region.getByLabel('本地图片调整参数', { exact: true });
  await expect(output).toContainText('"width": 0.25');
  await expect(output).toContainText('"x": 0.75');
  await expect(output).toContainText('"pixelWidth": 200');
  await expect(output).toContainText('"pixelHeight": 300');
});

test('pointer sorting reorders at a row and cancels a release outside every row', async ({
  page,
}) => {
  await page.goto('/ui/data');
  const list = page.getByRole('list', { name: '可拖拽与键盘排序', exact: true });
  await list.scrollIntoViewIfNeeded();
  const first = list.getByRole('button', { name: '移动欢迎使用 OneAster', exact: true });
  const source = await first.boundingBox();
  const target = await list
    .getByRole('button', { name: '移动内容编辑指南', exact: true })
    .boundingBox();
  if (!source || !target) throw new Error('Visible sorting handles require measured bounds.');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await expect(page.getByRole('status').filter({ hasText: '移至第 2 项' })).toBeVisible();
  await page.mouse.up();
  await expect(list.getByRole('listitem').first()).toHaveText('内容编辑指南');
  await page.reload();
  await list.scrollIntoViewIfNeeded();
  const origin = await first.boundingBox();
  if (!origin) throw new Error('Visible sorting handle requires measured bounds.');
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
  await page.mouse.down();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(10, 10, { steps: 12 });
  await page.mouse.up();
  await expect(first).not.toHaveAttribute('aria-pressed', 'true');
  await expect(list.getByRole('listitem').first()).toHaveText('欢迎使用 OneAster');
});

test('nested dialogs preserve the outer form, focus and recoverable failure state', async ({
  page,
}) => {
  await page.goto('/ui/overlays');
  const trigger = page.getByRole('button', { name: '打开示例表单', exact: true });
  await trigger.click();
  const form = page.getByRole('dialog', { name: '本地示例表单', exact: true });
  await form.getByRole('textbox', { name: '示例标题', exact: true }).fill('保留的输入');
  const nestedTrigger = form.getByRole('button', { name: '打开嵌套弹窗', exact: true });
  await nestedTrigger.click();
  await expect(page.getByRole('dialog', { name: '嵌套弹窗', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '嵌套弹窗', exact: true })).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(nestedTrigger).toBeFocused();
  await form.getByRole('checkbox', { name: '演示提交失败', exact: true }).check();
  await form.getByRole('button', { name: '应用本地输入', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('这是合成错误');
  await expect(form.getByRole('alert')).toBeFocused();
  await expect(form.getByRole('textbox', { name: '示例标题', exact: true })).toHaveValue(
    '保留的输入',
  );
  await form.getByRole('checkbox', { name: '演示提交失败', exact: true }).uncheck();
  await form.getByRole('button', { name: '应用本地输入', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('status', { name: '最近本地提交', exact: true })).toHaveText(
    '保留的输入',
  );
});

test('searchable selection supports keyboard focus, labels after close and creating an option', async ({
  page,
}) => {
  await page.goto('/ui/inputs');
  const trigger = page.getByRole('combobox', { name: '异步选择', exact: true });
  await trigger.click();
  const popup = page.getByRole('dialog', { name: '异步选择', exact: true });
  const input = popup.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('设计');
  await popup.getByRole('option', { name: '设计', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toHaveText('设计');
  await expect(trigger).toBeFocused();
  await page.getByRole('checkbox', { name: '演示选项加载失败', exact: true }).check();
  await expect(trigger).toHaveText('设计');
  await trigger.click();
  await expect(popup.getByRole('alert')).toContainText('本地选项示例暂不可用');
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: '演示选项加载失败', exact: true }).uncheck();
  await trigger.click();
  await input.fill('Browser created');
  await page.getByRole('button', { name: '创建本地选项“Browser created”', exact: true }).click();
  await expect(input).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveText('Browser created');
});

test.describe('touch sorting', () => {
  test.use({ hasTouch: true });
  test('touch gestures on handles reorder the same controlled list', async ({ page, context }) => {
    await page.goto('/ui/data');
    const list = page.getByRole('list', { name: '可拖拽与键盘排序', exact: true });
    await list.scrollIntoViewIfNeeded();
    const source = await list
      .getByRole('button', { name: '移动欢迎使用 OneAster', exact: true })
      .boundingBox();
    const target = await list
      .getByRole('button', { name: '移动内容编辑指南', exact: true })
      .boundingBox();
    if (!source || !target) throw new Error('Touch handles require measured bounds.');
    const cdp = await context.newCDPSession(page);
    try {
      const x = source.x + source.width / 2;
      const from = source.y + source.height / 2;
      const to = target.y + target.height / 2;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y: from, id: 1 }],
      });
      for (let step = 1; step <= 8; step++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: from + ((to - from) * step) / 8, id: 1 }],
        });
      await expect(page.getByRole('status').filter({ hasText: '移至第 2 项' })).toBeVisible();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(list.getByRole('listitem').first()).toHaveText('内容编辑指南');
    } finally {
      await cdp.detach();
    }
  });
});

test('1440 and 390 layouts keep every category within the viewport and capture acceptance views', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ui/lists');
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: '添加本地示例', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '添加本地示例', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('desktop-light-zh.png'),
    fullPage: true,
    animations: 'disabled',
    caret: 'initial',
  });
  await page.getByRole('button', { name: '切换主题', exact: true }).click();
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Content list', exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('desktop-dark-en.png'),
    fullPage: true,
    animations: 'disabled',
    caret: 'initial',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: test.info().outputPath('mobile-dark-en.png'),
    fullPage: true,
    animations: 'disabled',
    caret: 'initial',
  });
  const scrollRegion = page.getByRole('region').filter({ has: page.getByRole('table') });
  await scrollRegion.focus();
  for (let step = 0; step < 20; step++) await page.keyboard.press('ArrowRight', { delay: 40 });
  expect(await scrollRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(
    page.getByRole('columnheader', { name: 'Updated at', exact: true }),
  ).toBeInViewport();
  for (const category of [
    'actions',
    'inputs',
    'layout',
    'feedback',
    'data',
    'overlays',
    'documents',
  ]) {
    await page.goto(`/ui/${category}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(
      widths.content,
      `${category} must keep horizontal overflow inside its scrollable components`,
    ).toBeLessThanOrEqual(widths.viewport);
  }
  await page.goto('/ui/lists');
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.getByRole('button', { name: 'Switch language', exact: true }).click();
  await page.screenshot({
    path: test.info().outputPath('mobile-light-zh.png'),
    fullPage: true,
    animations: 'disabled',
    caret: 'initial',
  });
});
