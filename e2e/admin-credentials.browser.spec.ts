import { createHash, randomBytes } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { collectionListSchema } from '../apps/admin/src/contracts/content.ts';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  loginManagement,
  test,
  waitForApi,
} from '../test/support/admin-browser-management.ts';

function apiOrigin() {
  const origins = (process.env.CMS_ADMIN_E2E_API_ORIGINS ?? '').split(',');
  const origin = origins[test.info().project.name === 'development' ? 0 : 1];
  if (!origin) throw new Error('The credential journey requires its isolated API origin.');
  return origin;
}

const credentialListSchema = z.object({
  rows: z.array(z.object({ id: z.uuid(), name: z.string(), status: z.string() })),
  total: z.number(),
});
const keyCreatedSchema = z.object({
  credential: z.object({
    id: z.uuid(),
    grants: z.array(
      z.object({
        operationId: z.string(),
        scopeKind: z.string(),
        collectionKey: z.string().nullable(),
      }),
    ),
  }),
  apiKey: z.string().min(1),
});

const callback = 'http://127.0.0.1:43851/callback';
const metadataSchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
});

async function oauthConsent(
  page: Page,
  input: { name: string; authenticate: boolean; approve: boolean },
) {
  const discovery = await fetch(`${apiOrigin()}/.well-known/oauth-authorization-server`, {
    signal: AbortSignal.timeout(10000),
  });
  expect(discovery.status).toBe(200);
  const metadata = metadataSchema.parse(await discovery.json());
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: 'cms-cli',
    response_type: 'code',
    redirect_uri: callback,
    resource: metadata.issuer,
    scope: 'cms offline_access',
    state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  const navigated = await page.goto(url.href);
  expect(navigated?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(navigated?.headers()['x-frame-options']).toBe('DENY');
  if (input.authenticate) {
    await expect(page).toHaveURL(/\/login\?next=/);
    await page
      .getByRole('textbox', { name: '邮箱', exact: true })
      .fill(applicationAccounts.owner.email);
    await page.getByLabel(/^密码/).fill(applicationAccounts.owner.password);
    const signedIn = waitForApi(page, 'POST', '/v1/auth/login');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    expect((await signedIn).status()).toBe(200);
  }
  await expect(page).toHaveURL(/\/authorize\?request=[a-zA-Z0-9_-]+$/);
  await expect(page.getByRole('heading', { name: '授权应用访问' })).toBeVisible();
  await assertConsentCannotBeFramed(page);
  await expect(page.getByText(callback, { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill(input.name);
  if (input.approve)
    await page
      .getByRole('checkbox', { name: 'collections: collections.list', exact: true })
      .check();
  await page
    .getByRole('button', { name: input.approve ? '同意所选权限' : '拒绝授权', exact: true })
    .click();
  await page.waitForURL(
    (value) => value.origin === new URL(callback).origin && value.pathname === '/callback',
  );
  const returned = new URL(page.url());
  expect(returned.searchParams.get('state')).toBe(state);
  if (!input.approve) {
    expect(returned.searchParams.get('error')).toBe('access_denied');
    expect(returned.searchParams.has('code')).toBe(false);
    return null;
  }
  const code = returned.searchParams.get('code');
  if (!code) throw new Error('Approved consent did not issue an authorization code.');
  const response = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'cms-cli',
      code,
      redirect_uri: callback,
      code_verifier: verifier,
      resource: metadata.issuer,
    }),
    signal: AbortSignal.timeout(10000),
  });
  expect(response.status).toBe(200);
  return z
    .object({ access_token: z.string().min(1), token_type: z.literal('Bearer') })
    .parse(await response.json()).access_token;
}

async function assertConsentCannotBeFramed(page: Page) {
  const response = await page.request.get(page.url());
  expect(response.status()).toBe(200);
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(response.headers()['x-frame-options']).toBe('DENY');
  const probe = await page.context().newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  probe.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  probe.on('pageerror', (error) => pageErrors.push(error.message));
  const parent = new URL('/_credential_frame_probe', page.url()).href;
  try {
    await probe.route(parent, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Frame probe</title><link rel="icon" href="data:,"><body></body>',
      }),
    );
    await probe.goto(parent);
    const text = await probe.evaluate(async (source) => {
      const frame = document.createElement('iframe');
      frame.src = source;
      await new Promise<void>((resolve) => {
        frame.addEventListener('load', () => resolve(), { once: true });
        document.body.append(frame);
      });
      let value = '';
      try {
        value = frame.contentDocument?.body?.textContent ?? '';
      } catch {}
      frame.remove();
      return value;
    }, page.url());
    expect(text).not.toContain('授权应用访问');
    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toContain("frame-ancestors 'none'");
    expect(pageErrors).toEqual([]);
  } finally {
    await probe.close();
  }
}

async function loginCredentials(page: Page) {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await page.waitForURL((url) => url.pathname === '/dashboard');
}

async function tokenStatus(token: string) {
  const response = await fetch(`${apiOrigin()}/v1/collections`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  await response.body?.cancel();
  return response.status;
}

test('creates an explicitly scoped API key once, keeps its secret out of rereads and revokes it on a narrow screen', async ({
  page,
}) => {
  await loginCredentials(page);
  await page.goto('/dashboard/account');
  await page.getByRole('link', { name: '个人访问凭据', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/account\/credentials$/);
  await page.setViewportSize({ width: 360, height: 780 });
  const collectionsResponse = await bffRequest(page, { method: 'GET', path: '/v1/collections' });
  const collections = collectionListSchema.parse(await collectionsResponse.json());
  const articles = collections.rows.find((collection) => collection.key === 'articles');
  if (!articles)
    throw new Error('The credential journey requires the registered articles collection.');
  await page.getByRole('button', { name: '创建 API Key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建 API Key', exact: true });
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('Browser article key');
  await dialog
    .getByRole('checkbox', { name: `${articles.label}: documents.get`, exact: true })
    .check();
  const createdResponse = waitForApi(page, 'POST', '/v1/me/api-keys');
  await dialog.getByRole('button', { name: '创建 API Key', exact: true }).click();
  const created = keyCreatedSchema.parse(await (await createdResponse).json());
  expect(created.credential.grants).toEqual([
    { operationId: 'documents.get', scopeKind: 'collection', collectionKey: 'articles' },
  ]);
  await expect(page.getByRole('textbox', { name: 'API Key 秘密', exact: true })).toHaveValue(
    created.apiKey,
  );
  await page.getByRole('button', { name: '我已保存，关闭', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const reread = await bffRequest(page, {
    method: 'GET',
    path: '/v1/me/credentials?kind=api_key&page=1&pageSize=20',
  });
  const rereadText = await reread.text();
  expect(rereadText).not.toContain(created.apiKey);
  expect(rereadText).not.toContain('refresh_token');
  expect(
    credentialListSchema
      .parse(JSON.parse(rereadText))
      .rows.some((row) => row.id === created.credential.id),
  ).toBe(true);
  const row = page.getByRole('row').filter({ hasText: 'Browser article key' });
  await row.getByRole('button', { name: '撤销 Key', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row.getByRole('button', { name: '撤销 Key', exact: true })).toBeFocused();
  await row.getByRole('button', { name: '撤销 Key', exact: true }).click();
  const revoked = waitForApi(page, 'DELETE', `/v1/me/credentials/${created.credential.id}`);
  await page.getByRole('button', { name: '确认撤销', exact: true }).click();
  expect((await revoked).status()).toBe(204);
  await expect(row.getByText('已撤销', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '撤销 Key', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('preserves the login return request, revokes a single CLI sign-in and then all sign-ins of the application', async ({
  page,
}) => {
  await page.route(`${callback}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>OAuth callback received</title><p>OAuth callback received</p>',
    }),
  );
  const first = await oauthConsent(page, {
    name: 'Browser CLI one',
    authenticate: true,
    approve: true,
  });
  const second = await oauthConsent(page, {
    name: 'Browser CLI two',
    authenticate: false,
    approve: true,
  });
  if (!first || !second) throw new Error('Approved CLI sign-ins require access tokens.');
  expect(await tokenStatus(first)).toBe(200);
  expect(await tokenStatus(second)).toBe(200);
  await page.goto('/dashboard/account/credentials');
  await page.getByRole('tab', { name: 'OAuth 登录', exact: true }).click();
  const firstRow = page.getByRole('row').filter({ hasText: 'Browser CLI one' });
  await firstRow.getByRole('button', { name: '吊销本次登录', exact: true }).click();
  await page.getByRole('button', { name: '确认撤销', exact: true }).click();
  await expect(firstRow.getByText('已撤销', { exact: true })).toBeVisible();
  expect(await tokenStatus(first)).toBe(401);
  expect(await tokenStatus(second)).toBe(200);
  const secondRow = page.getByRole('row').filter({ hasText: 'Browser CLI two' });
  await secondRow.getByRole('button', { name: '撤销此应用全部登录', exact: true }).click();
  await page.getByRole('button', { name: '确认撤销', exact: true }).click();
  await expect(secondRow.getByText('已撤销', { exact: true })).toBeVisible();
  expect(await tokenStatus(second)).toBe(401);
  const browserStorage = await page.evaluate(() =>
    [Object.values(localStorage), Object.values(sessionStorage)].flat().join(' '),
  );
  expect(browserStorage).not.toContain(first);
  expect(browserStorage).not.toContain(second);
});

test('denies OAuth consent without issuing a code or creating a login credential', async ({
  page,
}) => {
  await loginCredentials(page);
  const before = credentialListSchema.parse(
    await (
      await bffRequest(page, {
        method: 'GET',
        path: '/v1/me/credentials?kind=oauth&page=1&pageSize=20',
      })
    ).json(),
  );
  await page.route(`${callback}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>OAuth denied</title><p>OAuth denied</p>',
    }),
  );
  expect(
    await oauthConsent(page, { name: 'Denied browser CLI', authenticate: false, approve: false }),
  ).toBeNull();
  const ports = (process.env.CMS_ADMIN_E2E_PORTS ?? '').split(',');
  const port = ports[test.info().project.name === 'development' ? 0 : 1];
  await page.goto(`http://127.0.0.1:${port}/dashboard/account/credentials`);
  const after = credentialListSchema.parse(
    await (
      await bffRequest(page, {
        method: 'GET',
        path: '/v1/me/credentials?kind=oauth&page=1&pageSize=20',
      })
    ).json(),
  );
  expect(after.total).toBe(before.total);
  expect(after.rows.some((row) => row.name === 'Denied browser CLI')).toBe(false);
});

test('keeps English credential controls and validation usable at mobile width', async ({
  page,
}) => {
  await loginCredentials(page);
  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const label = 'LongCollectionLabel'.repeat(6);
  await page.route(/\/api\/cms\/v1\/collections(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const data = collectionListSchema.parse(await response.json());
    await route.fulfill({
      response,
      json: {
        ...data,
        rows: data.rows.map((collection) =>
          collection.key === 'articles' ? { ...collection, label } : collection,
        ),
      },
    });
  });
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/dashboard/account/credentials');
  await expect(
    page.getByRole('heading', { name: 'Personal access credentials', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create API key', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create API key', exact: true });
  const choice = page.getByRole('checkbox', { name: `${label}: documents.get`, exact: true });
  await expect(choice).toBeVisible();
  await choice.check();
  await expect(choice).toBeChecked();
  const overflowing = await page
    .getByRole('dialog')
    .evaluate((container) =>
      [container, ...container.querySelectorAll('fieldset,div')]
        .filter(
          (element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => element.tagName),
    );
  expect(overflowing).toEqual([]);
  await dialog.getByRole('button', { name: 'Create API key', exact: true }).click();
  await expect(
    dialog.getByText('Enter a name with no more than 80 characters.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'OAuth sign-ins', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'API keys', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
