import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { loginManagement, test, captureApiJson } from '../test/support/admin-browser-management.ts';

const writtenDocument = z.object({ id: z.uuid(), revision: z.number() });

test('content publication states and selection scopes remain accurate through real navigation', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/collections/articles/new?locale=en');
  await page.getByRole('textbox', { name: /^title/ }).fill('Published workflow story');
  await page.getByRole('textbox', { name: /^slug/ }).fill('production-workflow-story');
  const creation = await captureApiJson(
    page,
    { method: 'POST', path: '/v1/collections/articles/documents', status: 201 },
    writtenDocument,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const created = await creation.read();
  await expect(page).toHaveURL(new RegExp(`/articles/${created.id}\\?locale=en$`));
  await expect(page.getByText('草稿', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '当前文件', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  const publication = await captureApiJson(
    page,
    {
      method: 'POST',
      path: `/v1/collections/articles/documents/${created.id}/publications`,
      status: 200,
    },
    writtenDocument,
  );
  await page
    .getByRole('dialog', { name: '确认操作', exact: true })
    .getByRole('button', { name: '确认操作', exact: true })
    .click();
  await publication.read();
  await expect(page.getByText('已发布', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: /^title/ }).fill('Private workflow changes');
  const saving = await captureApiJson(
    page,
    { method: 'PATCH', path: `/v1/collections/articles/documents/${created.id}`, status: 200 },
    writtenDocument,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await saving.read();
  await expect(page.getByText('有未发布修改', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await expect(page.getByText('有未发布修改', { exact: true })).toBeVisible();
  await page
    .getByRole('checkbox', { name: '选择文档 Private workflow changes', exact: true })
    .check();
  await expect(page.getByRole('button', { name: '批量操作', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '回收站', exact: true }).click();
  await expect(page.getByText('没有匹配记录', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '批量操作', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole('checkbox', { name: '选择文档 Private workflow changes', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('combobox', { name: '视图', exact: true }).selectOption('published');
  await expect(
    page.getByRole('button', { name: 'Published workflow story', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('线上快照', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '集合结构', exact: true }).click();
  await expect(page.getByRole('heading', { name: '内容字段', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.width);
  await page.screenshot({
    path: test.info().outputPath('content-structure-narrow.png'),
    fullPage: true,
  });
});
