import { expect, test as base } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { z } from 'zod';
import { observeBrowserErrors } from './browser-errors.ts';
import { extractFrontendUrl } from './smtp.ts';
import type { AdminMailboxConnection } from './admin-mailbox.ts';

export const test = base.extend<{ browserErrors: ReturnType<typeof observeBrowserErrors> }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors = observeBrowserErrors(page);
      await use(errors);
      expect(errors.issues(), 'Management pages must have no unexpected browser errors.').toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

export function waitForApi(page: Page, method: string, path: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === `/api/cms${path}`,
  );
}

export async function captureApiJson<Value>(
  page: Page,
  request: {
    method: string;
    path: string;
    status: number;
    query?: Readonly<Record<string, string>>;
  },
  schema: z.ZodType<Value>,
) {
  const matches = (url: URL) =>
    url.pathname === `/api/cms${request.path}` &&
    Object.entries(request.query ?? {}).every(
      ([key, value]) => url.searchParams.get(key) === value,
    );
  let projection: unknown;
  async function capture(route: Route) {
    if (route.request().method() !== request.method) {
      await route.fallback();
      return;
    }
    const upstream = await route.fetch({ maxRedirects: 0 });
    try {
      projection = await upstream.json();
    } finally {
      await route.fulfill({ response: upstream });
      await upstream.dispose();
    }
  }
  await page.route(matches, capture);
  const response = page.waitForResponse(
    (observed) =>
      observed.request().method() === request.method && matches(new URL(observed.url())),
  );
  return {
    async read(): Promise<Value> {
      try {
        const observed = await response;
        expect(observed.status()).toBe(request.status);
        return schema.parse(projection);
      } finally {
        await page.unroute(matches, capture);
      }
    },
  };
}

export async function loginManagement(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(account.email);
  await page.getByLabel(/^密码/).fill(account.password);
  const response = waitForApi(page, 'POST', '/v1/auth/login');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  return response;
}

export async function signOutManagement(page: Page) {
  await page.getByRole('button', { name: '账户菜单', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
}

export function expectHttp(
  page: Page,
  errors: ReturnType<typeof observeBrowserErrors>,
  failure: { method: string; path: string; status: number; count?: number },
) {
  errors.expectHttpFailure({
    method: failure.method,
    url: new URL(`/api/cms${failure.path}`, page.url()).href,
    status: failure.status,
    count: failure.count ?? 1,
  });
}

export async function bffRequest(
  page: Page,
  request: { method: string; path: string; data?: unknown },
) {
  return page.request.fetch(`/api/cms${request.path}`, {
    method: request.method,
    headers: { origin: new URL(page.url()).origin },
    ...(request.data === undefined ? {} : { data: request.data }),
  });
}

const connectionsSchema = z
  .array(z.object({ origin: z.url(), capability: z.string().min(1) }))
  .length(2);

async function mailboxMessages(connection: AdminMailboxConnection) {
  const response = await fetch(`${connection.origin}/messages`, {
    headers: { authorization: `Bearer ${connection.capability}` },
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`Test mailbox returned HTTP ${response.status}.`);
  return z.object({ messages: z.array(z.string()) }).parse(await response.json()).messages;
}

export function managementMailbox(project: string) {
  const connections = connectionsSchema.parse(
    JSON.parse(process.env.CMS_ADMIN_E2E_MAILBOXES ?? 'null'),
  );
  const selected = connections[project === 'development' ? 0 : 1];
  if (!selected) throw new Error('Run management journeys through bun run test:e2e.');
  const connection = selected;
  const messages = () => mailboxMessages(connection);
  return {
    messages,
    async link({
      after,
      recipient,
      path,
      frontendOrigin,
    }: {
      after: number;
      recipient: string;
      path: string;
      frontendOrigin: string;
    }) {
      let result: string | undefined;
      await expect
        .poll(
          async () => {
            const rows = (await messages())
              .slice(after)
              .filter((message) => message.includes(recipient));
            const links = rows
              .map(extractFrontendUrl)
              .filter((url) => new URL(url).pathname === path);
            result = links.at(-1);
            return Boolean(result);
          },
          { message: 'The real local SMTP listener must receive the complete action URL.' },
        )
        .toBe(true);
      if (!result) throw new Error('SMTP action URL was not received.');
      const url = new URL(result);
      expect(url.origin).toBe(frontendOrigin);
      expect(url.hash).toMatch(/^#token=[A-Za-z0-9_-]{43}$/);
      return result;
    },
  };
}

export async function passwordAction(page: Page, password: string, kind: 'invitation' | 'reset') {
  await page.getByLabel(/^新密码/).fill(password);
  await page.getByLabel(/^确认新密码/).fill(password);
  const response = waitForApi(
    page,
    'POST',
    kind === 'invitation' ? '/v1/auth/invitation-acceptances' : '/v1/auth/password-resets',
  );
  await page
    .getByRole('button', { name: kind === 'invitation' ? '激活账户' : '重置密码', exact: true })
    .click();
  return response;
}

export async function createPermissionInUi(page: Page, code: string, name: string) {
  await page.goto('/dashboard/permissions');
  await page.getByRole('button', { name: '创建权限', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建权限', exact: true });
  await dialog.getByLabel(/^权限编码/).fill(code);
  await dialog.getByLabel(/^名称/).fill(name);
  const created = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/permissions', status: 201 },
    z.object({ id: z.uuid(), version: z.number().int().positive() }),
  );
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  const projection = await created.read();
  await expect(dialog).toHaveCount(0);
  return projection;
}

export async function createRoleInUi(page: Page, code: string, name: string) {
  await page.goto('/dashboard/roles');
  await page.getByRole('button', { name: '创建角色', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '创建角色', exact: true });
  await dialog.getByLabel(/^编码/).fill(code);
  await dialog.getByLabel(/^名称/).fill(name);
  const created = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/roles', status: 201 },
    z.object({ id: z.uuid(), version: z.number().int().positive() }),
  );
  await dialog.getByRole('button', { name: '创建角色', exact: true }).click();
  const projection = await created.read();
  await expect(dialog).toHaveCount(0);
  return projection;
}
