import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { observeBrowserErrors } from '../test/support/browser-errors.ts';

declare global {
  interface Window {
    recordVisibleIdentity(text: string): Promise<void>;
  }
}

let browserErrors: ReturnType<typeof observeBrowserErrors>;

test.beforeEach(({ page }) => {
  browserErrors = observeBrowserErrors(page);
});

test.afterEach(() => {
  expect(
    browserErrors.issues(),
    'Application pages must have no unexpected browser errors.',
  ).toEqual([]);
});

function apiOrigin(): string {
  const origins = (process.env.CMS_ADMIN_E2E_API_ORIGINS ?? '').split(',');
  const index = test.info().project.name === 'development' ? 0 : 1;
  const origin = origins[index];
  if (!origin) throw new Error('Run application journeys through bun run test:e2e.');
  return origin;
}

async function login(page: Page, account: typeof applicationAccounts.owner) {
  await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(account.email);
  await page.getByLabel(/^密码/).fill(account.password);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/cms/v1/auth/login',
  );
  await page.getByRole('button', { name: '登录', exact: true }).click();
  return response;
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: '账户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
}

function prefetchDashboard(page: Page) {
  return page.evaluate(async () => {
    const [prefetch, response] = await Promise.all([
      fetch('/dashboard', { headers: { RSC: '1', 'Next-Router-Prefetch': '1' } }),
      fetch('/dashboard', { headers: { RSC: '1' } }),
    ]);
    return {
      body: await response.text(),
      prefetchBody: await prefetch.text(),
      cacheControl: response.headers.get('cache-control'),
      prefetchCacheControl: prefetch.headers.get('cache-control'),
      status: response.status,
      prefetchStatus: prefetch.status,
    };
  });
}

test('unauthenticated deep links and the root open the real login without protected content', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible();
  await expect(page.getByText(applicationAccounts.owner.email, { exact: true })).toHaveCount(0);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test('real login renders its identity, hides the token in an HttpOnly cookie and logout revokes it', async ({
  page,
  context,
}) => {
  const browserAuthorization: string[] = [];
  page.on('request', (request) => {
    const { authorization } = request.headers();
    if (authorization) browserAuthorization.push(authorization);
  });
  let loginProjection: unknown;
  await page.route('**/api/cms/v1/auth/login', async (route) => {
    const upstream = await route.fetch();
    loginProjection = await upstream.json();
    await route.fulfill({ response: upstream });
  });
  await page.goto('/login');
  const response = await login(page, applicationAccounts.owner);
  expect(response.status()).toBe(200);
  expect(loginProjection).toEqual({ expiresAt: expect.any(String) });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText(applicationAccounts.owner.email, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(applicationAccounts.owner.displayName, { exact: true }).first(),
  ).toBeVisible();
  const session = (await context.cookies()).find((cookie) => cookie.name === 'oneaster-session');
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  if (!session) throw new Error('The successful login must establish a session cookie.');
  expect(session.expires).toBeGreaterThan(Date.now() / 1000);
  const clientState = await page.evaluate(() => ({
    cookie: document.cookie,
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
    html: document.documentElement.outerHTML,
  }));
  for (const value of Object.values(clientState)) expect(value).not.toContain(session.value);
  expect(clientState.cookie).not.toContain('oneaster-session');
  expect(browserAuthorization).toEqual([]);
  const navigation = await page.request.get('/dashboard');
  expect(navigation.headers()['cache-control']).toContain('no-store');
  expect(await navigation.text()).not.toContain(session.value);
  await signOut(page);
  expect((await context.cookies()).some((cookie) => cookie.name === 'oneaster-session')).toBe(
    false,
  );
  const revoked = await fetch(`${apiOrigin()}/v1/me`, {
    headers: { authorization: `Bearer ${session.value}` },
    signal: AbortSignal.timeout(10000),
  });
  expect(revoked.status).toBe(401);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test('wrong credentials and the real rate limit give localized feedback and preserve input', async ({
  page,
  baseURL,
}) => {
  await page.goto('/login');
  const url = new URL('/api/cms/v1/auth/login', baseURL).href;
  browserErrors.expectHttpFailure({ method: 'POST', url, status: 401, count: 5 });
  browserErrors.expectHttpFailure({ method: 'POST', url, status: 429, count: 1 });
  const account = {
    email: 'incorrect-application@example.test',
    password: 'Incorrect password 2026',
    displayName: 'Invalid credentials',
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await login(page, account);
    expect(response.status()).toBe(401);
    await expect(
      page.getByRole('form', { name: '管理员登录', exact: true }).getByRole('alert'),
    ).toContainText('邮箱或密码不正确。');
    await expect(page.getByRole('textbox', { name: '邮箱', exact: true })).toHaveValue(
      account.email,
    );
    await expect(page.getByLabel(/^密码/)).toHaveValue(account.password);
  }
  const response = await login(page, account);
  expect(response.status()).toBe(429);
  expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
  await expect(
    page.getByRole('form', { name: '管理员登录', exact: true }).getByRole('alert'),
  ).toContainText(/频繁|稍后|重试/);
  await expect(page).toHaveURL(/\/login$/);
});

test('a revoked cookie on a protected deep link is verified before a fresh login replaces it', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  expect((await login(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const session = (await context.cookies()).find((cookie) => cookie.name === 'oneaster-session');
  if (!session) throw new Error('The real backend must establish the session being revoked.');
  const revoked = await fetch(`${apiOrigin()}/v1/auth/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.value}` },
    signal: AbortSignal.timeout(10000),
  });
  expect(revoked.status).toBe(204);
  const verified = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/auth/expired-session',
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get('reason')).toBe('expired');
  expect((await verified).status()).toBe(204);
  await expect(page.getByText('会话已过期，请重新登录。', { exact: true })).toBeVisible();
  expect(
    (await context.cookies()).find((cookie) => cookie.name === 'oneaster-session')?.value,
  ).toBe(session.value);
  await expect(page.getByText(applicationAccounts.owner.email, { exact: true })).toHaveCount(0);
  expect((await login(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  const renewed = (await context.cookies()).find((cookie) => cookie.name === 'oneaster-session');
  expect(renewed).toMatchObject({ httpOnly: true });
  expect(renewed?.value).not.toBe(session.value);
  await expect(
    page.getByText(applicationAccounts.owner.email, { exact: true }).first(),
  ).toBeVisible();
});

test('signing out A and signing in B keeps browser history and prefetched pages free of A', async ({
  page,
}) => {
  let observingB = false;
  const observed: string[] = [];
  await page.exposeFunction('recordVisibleIdentity', (text: string) => {
    if (
      observingB &&
      (text.includes(applicationAccounts.owner.email) ||
        text.includes(applicationAccounts.owner.displayName))
    )
      observed.push(text);
  });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      void window.recordVisibleIdentity(document.body?.innerText ?? '');
    });
    observer.observe(document, { childList: true, subtree: true, characterData: true });
    window.addEventListener('pagehide', () => observer.disconnect());
    window.addEventListener('pageshow', () => {
      observer.observe(document, { childList: true, subtree: true, characterData: true });
      void window.recordVisibleIdentity(document.body?.innerText ?? '');
    });
  });
  await page.goto('/login');
  expect((await login(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: '概览', exact: true }).hover();
  const prefetchedA = await prefetchDashboard(page);
  expect(prefetchedA.status).toBe(200);
  expect(prefetchedA.prefetchStatus).toBe(200);
  expect(prefetchedA.body).toContain(applicationAccounts.owner.email);
  expect(prefetchedA.cacheControl).toContain('no-store');
  expect(prefetchedA.prefetchCacheControl).toContain('no-store');
  await page.goto('/ui');
  await page.goto('/dashboard');
  await signOut(page);
  await expect(page.getByRole('heading', { name: '管理员登录', exact: true })).toBeVisible();
  observingB = true;
  expect((await login(page, applicationAccounts.reader)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText(applicationAccounts.reader.email, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(applicationAccounts.owner.email, { exact: true })).toHaveCount(0);
  await expect(page.getByText(applicationAccounts.owner.displayName, { exact: true })).toHaveCount(
    0,
  );
  const prefetchedB = await prefetchDashboard(page);
  expect(prefetchedB.status).toBe(200);
  expect(prefetchedB.prefetchStatus).toBe(200);
  expect(prefetchedB.body).toContain(applicationAccounts.reader.email);
  expect(prefetchedB.body).not.toContain(applicationAccounts.owner.email);
  expect(prefetchedB.prefetchBody).not.toContain(applicationAccounts.owner.email);
  expect(prefetchedB.cacheControl).toContain('no-store');
  expect(prefetchedB.prefetchCacheControl).toContain('no-store');
  await page.goBack();
  await page.goBack();
  await expect(
    page.getByText(applicationAccounts.reader.email, { exact: true }).first(),
  ).toBeVisible();
  await page.goForward();
  await page.goForward();
  await page.goto('/dashboard');
  await expect(
    page.getByText(applicationAccounts.reader.email, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(applicationAccounts.owner.email, { exact: true })).toHaveCount(0);
  expect(observed).toEqual([]);
});

test('regression: login waits for JavaScript before submitting autofilled credentials', async ({
  page,
}) => {
  let releaseScripts: (() => void) | undefined;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  const prematureSubmissions: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') prematureSubmissions.push(request.url());
  });
  await page.route(
    (url) => url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js'),
    async (route) => {
      await scriptsReady;
      await route.continue();
    },
  );
  const submit = page.getByRole('button', { name: '登录', exact: true, includeHidden: true });
  try {
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(
      page.getByRole('heading', { name: '管理员登录', exact: true, includeHidden: true }),
    ).toBeVisible();
    await expect(submit).toBeDisabled();
    const bounds = await submit.boundingBox();
    if (!bounds) throw new Error('The server-rendered login button must be visible.');
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    expect(prematureSubmissions).toEqual([]);
  } finally {
    releaseScripts?.();
  }
  await expect(submit).toBeEnabled();
  await page.evaluate((account) => {
    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    const password = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (!email || !password) throw new Error('Login inputs must retain their semantic names.');
    email.value = account.email;
    password.value = account.password;
  }, applicationAccounts.reader);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === '/api/cms/v1/auth/login',
  );
  await submit.click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText(applicationAccounts.reader.email, { exact: true }).first(),
  ).toBeVisible();
});

for (const locale of ['zh', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`regression: login ${locale}/${theme} preserves 44px input heights and a centered password toggle at 390px`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: 'oneaster-locale', value: locale, url: new URL('/', baseURL).href },
        { name: 'oneaster-theme', value: theme, url: new URL('/', baseURL).href },
      ]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/login');
      const english = locale === 'en';
      await expect(
        page.getByRole('heading', {
          name: english ? 'Administrator sign in' : '管理员登录',
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`login-1440-${locale}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page.setViewportSize({ width: 390, height: 844 });
      const email = page.getByRole('textbox', { name: english ? 'Email' : '邮箱', exact: true });
      const password = page.getByLabel(english ? /^Password/ : /^密码/);
      const reveal = page.getByRole('button', {
        name: english ? 'Show password' : '显示密码',
        exact: true,
      });
      await email.focus();
      await page.keyboard.press('Tab');
      await expect(password).toBeFocused();
      for (const input of [email, password]) {
        const box = await input.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
      const inputBox = await password.boundingBox();
      const toggleBox = await reveal.boundingBox();
      if (!inputBox || !toggleBox)
        throw new Error('Password control and toggle must have visible bounds.');
      expect(
        Math.abs(inputBox.y + inputBox.height / 2 - toggleBox.y - toggleBox.height / 2),
      ).toBeLessThanOrEqual(1);
      await password.fill('  Unicode 密码 2026  ');
      await reveal.click();
      await expect(password).toHaveAttribute('type', 'text');
      await expect(password).toHaveValue('  Unicode 密码 2026  ');
      await page
        .getByRole('button', { name: english ? 'Hide password' : '隐藏密码', exact: true })
        .click();
      await expect(password).toHaveAttribute('type', 'password');
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
      const widths = await page.evaluate(() => ({
        viewport: window.innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content).toBeLessThanOrEqual(widths.viewport);
      await page.screenshot({
        path: test.info().outputPath(`login-390-${locale}-${theme}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await page
        .getByRole('button', { name: english ? 'Change language' : '切换语言', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: english ? '管理员登录' : 'Administrator sign in',
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: english ? '切换主题' : 'Change theme', exact: true })
        .click();
      await expect(page.locator('html')).toHaveCSS(
        'color-scheme',
        theme === 'light' ? 'dark' : 'light',
      );
      await page.reload();
      await expect(
        page.getByRole('heading', {
          name: english ? '管理员登录' : 'Administrator sign in',
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveCSS(
        'color-scheme',
        theme === 'light' ? 'dark' : 'light',
      );
    });
  }
}
