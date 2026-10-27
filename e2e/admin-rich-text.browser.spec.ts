import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test, captureApiJson } from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
});

async function createInUi(page: Page, slug: string) {
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Published story');
  await page.getByRole('textbox', { name: /^slug/ }).fill(slug);
  const saving = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await saving.read();
  await expect(page).toHaveURL(new RegExp(`/articles/${created.id}\\?locale=en$`));
  return created;
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

test('persists rich-text formats, structured lists, alignment and indentation through the real editor', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  const created = await createInUi(page, 'browser-rich-text-formats');
  const body = page.getByRole('textbox', { name: 'body', exact: true });
  await body.fill('Formatted story');
  await body.press('ControlOrMeta+A');
  for (const name of ['加粗', '斜体', '下划线', '删除线', '下标', '上标', '行内代码'])
    await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('button', { name: '下标', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByRole('button', { name: '上标', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('标题级别', { exact: true }).selectOption('3');
  await expect(body.getByRole('heading', { level: 3, name: 'Formatted story' })).toBeVisible();
  await page.getByRole('button', { name: '有序列表', exact: true }).click();
  await expect(body.locator('ol > li')).toHaveText('Formatted story');
  await page.getByRole('button', { name: '任务列表', exact: true }).click();
  await expect(body.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  await body.getByRole('checkbox').focus();
  await page.keyboard.press('Space');
  await expect(body.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '任务列表', exact: true }).click();
  await page.getByRole('button', { name: '引用', exact: true }).click();
  await expect(body.locator('blockquote')).toHaveText('Formatted story');
  await page.getByLabel('标题级别', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '居中', exact: true }).click();
  await page.getByRole('button', { name: '增加缩进', exact: true }).click();
  const saving = await captureApiJson(
    page,
    { method: 'PATCH', path: `/v1/collections/articles/documents/${created.id}`, status: 200 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await saving.read();
  expect(saved.data['body']).toEqual({
    version: 1,
    children: [
      {
        type: 'heading',
        level: 3,
        align: 'center',
        indent: 1,
        children: [
          {
            type: 'text',
            text: 'Formatted story',
            format: ['bold', 'italic', 'underline', 'strikethrough', 'superscript', 'code'],
          },
        ],
      },
    ],
  });
  await page.reload();
  await expect(body.getByRole('heading', { level: 3, name: 'Formatted story' })).toBeVisible();
  await expect(page.getByText('当前内容包含扩展结构，使用结构编辑保留全部节点。')).toHaveCount(0);
  await verifyEditorLayout(page, 390);
});
