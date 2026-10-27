import { expect } from '@playwright/test';
import { z } from 'zod';
import { applicationAccounts } from '../test/support/admin-application-data.ts';
import { captureApiJson, loginManagement, test } from '../test/support/admin-browser-management.ts';

const documentSchema = z.object({
  id: z.uuid(),
  revision: z.number(),
  versionId: z.uuid(),
  data: z.record(z.string(), z.unknown()),
});

test('model editor preserves request and sample JSON shapes through structured fields on desktop and narrow screens', async ({
  page,
}) => {
  expect((await loginManagement(page, applicationAccounts.owner)).status()).toBe(200);
  const response = await page.request.post('/api/cms/v1/collections/models/documents', {
    headers: { origin: new URL(page.url()).origin, 'idempotency-key': crypto.randomUUID() },
    data: {
      locale: 'en',
      data: {
        modelId: 'Browser-Editor',
        slug: 'browser-model-editor',
        title: 'Browser model editor',
        summary: 'Model editor summary',
        contentLocales: ['en'],
        primaryCategory: 'text',
        technicalCapabilities: {
          inputs: ['text'],
          outputs: ['text'],
          tasks: ['chat'],
          features: [],
        },
        apiBindings: [
          {
            key: 'chat',
            profileKey: 'core.chat',
            enabledFlowKeys: ['chat.json'],
            scenarios: [
              {
                key: 'hello',
                title: 'Hello',
                flowKey: 'chat.json',
                requestValues: { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 64 },
              },
            ],
          },
        ],
        defaultBindingKey: 'chat',
        showcase: [
          {
            key: 'answer',
            title: 'Sample answer',
            mediaType: 'text',
            outputText: 'Example answer',
            provenance: { kind: 'model-output', sourceLabel: 'Original source' },
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  const source = documentSchema.parse(await response.json());
  await page.goto(`/dashboard/collections/models/${source.id}?locale=en`);
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(page.getByRole('textbox', { name: /^Business model ID/u })).toHaveValue(
    'Browser-Editor',
  );
  await expect(page.getByRole('textbox', { name: /^Summary/u })).toHaveValue(
    'Model editor summary',
  );
  await page.getByRole('checkbox', { name: 'zh', exact: true }).check();
  await page.getByRole('tab', { name: 'Integrations', exact: true }).click();
  const content = page.getByRole('textbox', { name: /^content/u });
  await expect(content).toBeVisible();
  await content.fill('Changed request');
  await page.getByRole('tab', { name: 'Samples', exact: true }).click();
  await page.getByRole('textbox', { name: /^来源名称/u }).fill('Verified source');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`models-editor-${width}.png`),
      fullPage: true,
    });
  }
  const saving = await captureApiJson(
    page,
    { method: 'PATCH', path: `/v1/collections/models/documents/${source.id}`, status: 200 },
    documentSchema,
  );
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const saved = await saving.read();
  expect(saved.data['contentLocales']).toEqual(['en', 'zh']);
  expect(saved.data['apiBindings']).toEqual([
    expect.objectContaining({
      scenarios: [
        expect.objectContaining({
          requestValues: {
            messages: [{ role: 'user', content: 'Changed request' }],
            max_tokens: 64,
          },
        }),
      ],
    }),
  ]);
  expect(saved.data['showcase']).toEqual([
    expect.objectContaining({
      provenance: { kind: 'model-output', sourceLabel: 'Verified source' },
    }),
  ]);
});
