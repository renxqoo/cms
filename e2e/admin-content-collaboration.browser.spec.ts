import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import {
  bffRequest,
  expectHttp,
  loginManagement,
  test,
  captureApiJson,
} from '../test/support/admin-browser-management.ts';
import { observeBrowserErrors } from '../test/support/browser-errors.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number().int(),
  data: z.record(z.string(), z.unknown()),
});
test('two tabs take over real editing leases and a late writer preserves its draft without overwriting the winner', async ({
  page,
  browserErrors,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Collaboration source');
  await page.getByRole('textbox', { name: /^slug/ }).fill('collaboration-source');
  const creating = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await creating.read();
  await expect(page.getByText('当前标签页已取得编辑占用')).toBeVisible();
  const second = await page.context().newPage();
  const errors = observeBrowserErrors(second);
  try {
    await second.goto(
      new URL(`/dashboard/collections/articles/${created.id}?locale=en`, page.url()).href,
    );
    await expect(second.getByText(/此文档正在由以下人员编辑/)).toBeVisible();
    await expect(second.getByRole('textbox', { name: /^title/ })).toHaveAttribute('readonly', '');
    await second.getByRole('button', { name: '接管编辑', exact: true }).click();
    await expect(second.getByText('当前标签页已取得编辑占用')).toBeVisible();
    const path = `/v1/collections/articles/documents/${created.id}`;
    expectHttp(page, browserErrors, { method: 'PATCH', path, status: 423 });
    await page.getByRole('textbox', { name: /^title/ }).fill('Blocked overwrite draft');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText(/此文档正在由以下人员编辑/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^title/ })).toHaveValue(
      'Blocked overwrite draft',
    );
    await expect(page.getByRole('textbox', { name: /^title/ })).toHaveAttribute('readonly', '');
    await second.getByRole('textbox', { name: /^title/ }).fill('Winning editor value');
    const saving = await captureApiJson(
      second,
      { method: 'PATCH', path, status: 200 },
      documentSchema,
    );
    await second.getByRole('button', { name: '保存', exact: true }).click();
    expect((await saving.read()).data['title']).toBe('Winning editor value');
    expect(
      documentSchema.parse(
        await (
          await bffRequest(page, { method: 'GET', path: `${path}?locale=en&fallback=[]&depth=0` })
        ).json(),
      ).data['title'],
    ).toBe('Winning editor value');
    await second.close();
    await expect
      .poll(
        async () =>
          z
            .object({ lease: z.unknown().nullable() })
            .parse(
              await (
                await bffRequest(page, { method: 'GET', path: `${path}/lock?locale=en` })
              ).json(),
            ).lease,
        { intervals: [250, 500, 1000], timeout: 5000 },
      )
      .toBeNull();
    await page.getByRole('button', { name: '核实编辑占用', exact: true }).click();
    await expect(page.getByText('当前标签页已取得编辑占用')).toBeVisible();
    expect(errors.issues()).toEqual([]);
  } finally {
    if (!second.isClosed()) await second.close();
  }
});
