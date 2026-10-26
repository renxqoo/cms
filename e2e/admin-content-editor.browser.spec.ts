import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { captureApiJson, loginManagement, test } from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
});

async function exerciseRichText(page: Page) {
  const body = page.getByRole('textbox', { name: 'body', exact: true });
  await body.fill('Lexical story');
  await page.getByRole('button', { name: '标题', exact: true }).click();
  await expect(body.getByRole('heading', { name: 'Lexical story' })).toBeVisible();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(body.getByRole('heading')).toHaveCount(0);
  await expect(body).toHaveText('Lexical story');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(body.getByRole('heading', { name: 'Lexical story' })).toBeVisible();
  const list = page.getByRole('button', { name: '列表', exact: true });
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await expect(body.getByRole('listitem')).toHaveText('Lexical story');
  await list.click();
  await expect(list).toHaveAttribute('aria-pressed', 'false');
  await expect(body.getByRole('list')).toHaveCount(0);
  await page.getByRole('button', { name: '标题', exact: true }).click();
}

async function verifyEditorLayout(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const toolbar = page.getByRole('toolbar', { name: '富文本', exact: true });
  await expect(toolbar).toBeVisible();
  const sizes = await toolbar.evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.width);
  expect(sizes.document).toBeLessThanOrEqual(sizes.viewport);
  await page.screenshot({
    path: test.info().outputPath(`content-editor-${width}.png`),
    fullPage: true,
  });
}

test('regression: content creation captures its response before navigation and preserves Lexical editing at desktop and narrow widths', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  const title = page.getByRole('textbox', { name: /^title/ });
  await title.fill('Editor controls');
  await page.getByRole('textbox', { name: /^slug/ }).fill('browser-editor-controls');
  await page.getByRole('textbox', { name: /^summary/ }).fill('Summary');
  await expect(title.locator('..').getByRole('button', { name: '清空', exact: true })).toHaveCount(
    0,
  );
  await exerciseRichText(page);
  for (const width of [1440, 390]) await verifyEditorLayout(page, width);
  const saving = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await saving.read();
  expect(created.data['body']).toEqual({
    version: 1,
    children: [{ type: 'heading', children: [{ type: 'text', text: 'Lexical story' }] }],
  });
  await expect(page).toHaveURL(new RegExp(`/articles/${created.id}\\?locale=en$`));
  await page.reload();
  await expect(
    page
      .getByRole('textbox', { name: 'body', exact: true })
      .getByRole('heading', { name: 'Lexical story' }),
  ).toBeVisible();
});

async function seedInterfaceForLanguageSwitch(page: Page) {
  const { interfaceMessageContract, interfaceMessageSeeds } =
    await import('../apps/api/src/config/message-contract.ts');
  const headers = { origin: new URL(page.url()).origin };
  for (const locale of ['en', 'zh']) {
    const messages = interfaceMessageSeeds[locale];
    if (!messages) throw new Error('Missing browser software messages');
    for (const [namespace, bundle] of Object.entries(messages)) {
      const response = await page.request.post(
        '/api/cms/v1/collections/message-bundles/documents',
        {
          headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
          data: {
            data: {
              contractVersion: interfaceMessageContract.version,
              locale,
              namespace,
              messages: bundle,
            },
          },
        },
      );
      expect(response.status()).toBe(201);
    }
  }
  const result = [];
  for (const code of ['en', 'zh']) {
    const response = await page.request.post('/api/cms/v1/collections/languages/documents', {
      headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
      data: {
        data: { code, label: code, direction: 'ltr', enabled: true, default: code === 'en' },
      },
    });
    expect(response.status()).toBe(201);
    result.push(documentSchema.parse(await response.json()));
  }
  return result;
}

test('an administrator switches the default language atomically through the real editor', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  const [english, chinese] = await seedInterfaceForLanguageSwitch(page);
  if (!english || !chinese) throw new Error('Missing initialized languages');
  await page.goto(`/dashboard/collections/languages/${chinese.id}?locale=en`);
  const change = await captureApiJson(
    page,
    {
      method: 'POST',
      path: `/v1/collections/languages/documents/${chinese.id}/default-language`,
      status: 200,
    },
    documentSchema,
  );
  await page.getByRole('button', { name: '设为默认语言', exact: true }).click();
  const updated = await change.read();
  expect(updated.data['default']).toBe(true);
  expect(updated.revision).toBe(chinese.revision + 1);
  await expect(page.getByRole('button', { name: '设为默认语言', exact: true })).toHaveCount(0);
  const previous = documentSchema.parse(
    await (
      await page.request.get(`/api/cms/v1/collections/languages/documents/${english.id}`)
    ).json(),
  );
  expect(previous.data['default']).toBe(false);
  expect(previous.revision).toBe(english.revision + 1);
});
