import { expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { z } from 'zod';

export const browserDocument = z.object({
  id: z.uuid(),
  collection: z.string(),
  revision: z.number().int().positive(),
  versionId: z.uuid(),
  publishedVersionId: z.uuid().nullable(),
  trashedAt: z.iso.datetime().nullable(),
  folderId: z.uuid().nullable(),
  data: z.record(z.string(), z.unknown()),
});

export function contentRequest(
  page: Page,
  request: { method: string; path: string; data?: unknown; idempotent?: boolean },
) {
  return page.request.fetch(`/api/cms${request.path}`, {
    method: request.method,
    headers: {
      origin: new URL(page.url()).origin,
      ...(request.idempotent ? { 'idempotency-key': crypto.randomUUID() } : {}),
    },
    ...(request.data === undefined ? {} : { data: request.data }),
  });
}

export async function grantContentOperations(
  page: Page,
  input: { collection: string; operations: readonly string[] },
) {
  const permission = await contentRequest(page, {
    method: 'POST',
    path: '/v1/permissions',
    idempotent: true,
    data: {
      code: `browser:${input.collection}:manage`,
      name: `Browser ${input.collection} management`,
      scopeKind: 'collection',
      collectionKey: input.collection,
    },
  });
  expect(permission.status()).toBe(201);
  const { id } = z.object({ id: z.uuid() }).parse(await permission.json());
  for (const operationId of input.operations) {
    const response = await contentRequest(page, {
      method: 'POST',
      path: '/v1/endpoint-bindings',
      idempotent: true,
      data: {
        operationId,
        scopeKind: 'collection',
        collectionKey: input.collection,
        permissionId: id,
      },
    });
    expect(
      response.status(),
      `The real ${input.collection}/${operationId} binding must be initialized.`,
    ).toBe(201);
  }
  return id;
}

export function waitForContent(
  page: Page,
  input: { method: string; path: string; query?: Readonly<Record<string, string>> },
) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === input.method &&
      url.pathname === `/api/cms${input.path}` &&
      Object.entries(input.query ?? {}).every(
        ([name, value]) => url.searchParams.get(name) === value,
      )
    );
  });
}

export function trackContentRequests(page: Page) {
  const pending = new Set<Request>();
  const completed: { method: string; path: string; status: number }[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/cms/')) pending.add(request);
  });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => pending.delete(request));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/cms/'))
      completed.push({
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      });
  });
  return {
    completed,
    async settle() {
      await expect
        .poll(() => pending.size, {
          message: 'The current page must finish its actual CMS requests.',
        })
        .toBe(0);
    },
  };
}

export async function confirmContentAction(
  page: Page,
  input: { label: string; method: string; path: string },
) {
  await page.getByRole('button', { name: input.label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认文档操作', exact: true });
  await expect(dialog).toContainText(input.label);
  const response = waitForContent(page, input);
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  return response;
}

export async function expectNarrowManagementLayout(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: 'The administration page must not overflow its 390px viewport.',
    })
    .toBeLessThanOrEqual(0);
  for (const table of await page.getByRole('table').all()) {
    const horizontal = await table.evaluate((element) => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        const { overflowX } = getComputedStyle(ancestor);
        if (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          ancestor.scrollWidth > ancestor.clientWidth
        ) {
          ancestor.scrollLeft = ancestor.scrollWidth;
          const end = element.querySelector('tr:last-child > :last-child, thead th:last-child');
          const accessible =
            ancestor.scrollLeft > 0 &&
            (!end ||
              end.getBoundingClientRect().right <= ancestor.getBoundingClientRect().right + 1);
          ancestor.scrollLeft = 0;
          return accessible;
        }
        ancestor = ancestor.parentElement;
      }
      return element.getBoundingClientRect().right <= window.innerWidth + 1;
    });
    expect(
      horizontal,
      'Every table must expose its full content through its horizontal scroll container.',
    ).toBe(true);
  }
}
