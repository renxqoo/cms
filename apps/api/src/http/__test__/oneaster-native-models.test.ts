import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';
import { randomUUID } from 'node:crypto';
import { contentOperations } from '@new-cms/cms/content';
let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
const identity = z.object({ id: z.uuid(), revision: z.number() });
async function productionFixture() {
  const kit = await createHttpFixture();
  fixture = kit;
  const context = () => ({
    requestId: randomUUID(),
    ip: '127.0.0.1',
    token: kit.token,
    idempotencyKey: randomUUID(),
  });
  const permission = await kit.runtime.access.api.createPermission(context(), {
    code: 'native:model:manage',
    name: 'Manage native model fixture',
    scopeKind: 'collection',
    collectionKey: 'models',
  });
  for (const operation of contentOperations.filter((item) => item.scopeKind === 'collection'))
    await kit.runtime.access.api.createBinding(context(), {
      operationId: operation.id,
      scopeKind: 'collection',
      collectionKey: 'models',
      permissionId: permission.id,
    });
  return kit;
}
function base(modelId: string) {
  return {
    modelId,
    slug: modelId.toLowerCase(),
    title: modelId,
    summary: 'A native model publication',
    contentLocales: ['en'],
    primaryCategory: 'text',
    technicalCapabilities: { inputs: ['text'], outputs: ['text'], tasks: ['chat'], features: [] },
    apiBindings: [],
    defaultBindingKey: null,
  };
}
it('publishes a model through actual HTTP and native field tables with a cleared optional binding description', async () => {
  fixture = await productionFixture();
  const request = api(fixture);
  const created = await request('POST', '/v1/collections/models/documents', {
    body: {
      locale: 'en',
      data: {
        ...base('Native-Chat'),
        apiBindings: [
          {
            key: 'chat',
            profileKey: 'core.chat',
            inputModalities: ['text'],
            outputModalities: ['text'],
            capabilities: [],
            enabledFlowKeys: ['chat.json'],
            constraints: null,
            recipeKeys: ['core.http'],
            defaultScenarioKey: 'hello',
            scenarios: [
              {
                key: 'hello',
                title: 'Hello',
                description: null,
                flowKey: 'chat.json',
                requestValues: { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 64 },
              },
            ],
          },
        ],
        defaultBindingKey: 'chat',
      },
    },
  });
  expect(created.status).toBe(201);
  const document = identity.parse(await created.json());
  const published = await request(
    'POST',
    `/v1/collections/models/documents/${document.id}/publications`,
    { body: { revision: document.revision, locale: 'en' } },
  );
  expect(published.status).toBe(200);
  const delivered = await request('GET', '/v1/public/models/native-chat?locale=en', {
    token: null,
  });
  expect(delivered.status).toBe(200);
  expect(
    z
      .object({ data: z.object({ model: z.object({ modelId: z.string() }) }) })
      .parse(await delivered.json()).data.model.modelId,
  ).toBe('Native-Chat');
});
it('publishes native optional parameter metadata cleared to null without accepting null scenario inputs', async () => {
  fixture = await productionFixture();
  const request = api(fixture);
  const created = await request('POST', '/v1/collections/models/documents', {
    body: {
      locale: 'en',
      data: {
        ...base('Native-Parameters'),
        parameterReference: {
          fields: [
            {
              name: 'temperature',
              label: 'Temperature',
              type: 'number',
              required: false,
              description: null,
              placeholder: null,
              defaultValue: null,
              min: null,
              max: null,
              step: null,
            },
          ],
          scenarios: [
            {
              key: 'balanced',
              title: 'Balanced',
              description: null,
              values: { temperature: 0.4 },
              inputConstraints: [
                { field: 'temperature', required: null, allowedValues: null, min: null, max: null },
              ],
            },
          ],
          defaultScenarioKey: 'balanced',
        },
      },
    },
  });
  expect(created.status).toBe(201);
  const document = identity.parse(await created.json());
  const published = await request(
    'POST',
    `/v1/collections/models/documents/${document.id}/publications`,
    { body: { revision: document.revision, locale: 'en' } },
  );
  expect(published.status).toBe(200);
});

it('model editor provides sections and derived integration metadata without changing stored field paths', async () => {
  fixture = await productionFixture();
  const request = api(fixture);
  const response = await request('GET', '/v1/collections/models/editor?intent=create&locale=en');
  expect(response.status).toBe(200);
  const editor = z
    .object({
      layout: z.array(
        z.object({
          type: z.string(),
          tabs: z.array(z.object({ name: z.string().optional(), label: z.string() })).optional(),
        }),
      ),
    })
    .parse(await response.json());
  expect(editor.layout[0]?.type).toBe('tabs');
  expect(editor.layout[0]?.tabs?.map((tab) => tab.label)).toEqual([
    'Basic information',
    'Technical information and parameters',
    'Integrations',
    'Content',
    'Samples',
    'Presentation and SEO',
  ]);
  expect(editor.layout[0]?.tabs?.every((tab) => tab.name === undefined)).toBe(true);
  const created = await request('POST', '/v1/collections/models/documents', {
    body: {
      locale: 'en',
      data: {
        ...base('Editor-Chat'),
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
      },
    },
  });
  expect(created.status).toBe(201);
  const document = z
    .object({
      id: z.uuid(),
      data: z.object({
        modelId: z.string(),
        apiBindings: z.array(
          z.object({
            inputModalities: z.array(z.string()),
            outputModalities: z.array(z.string()),
            capabilities: z.array(z.string()),
            recipeKeys: z.array(z.string()),
            defaultScenarioKey: z.string(),
          }),
        ),
      }),
    })
    .parse(await created.json());
  expect(document.data.modelId).toBe('Editor-Chat');
  expect(document.data.apiBindings[0]).toEqual({
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: [],
    recipeKeys: ['core.http'],
    defaultScenarioKey: 'hello',
  });
  const updated = await request(
    'GET',
    `/v1/collections/models/editor?intent=update&id=${document.id}&locale=en`,
  );
  expect(updated.status).toBe(200);
  const metadata = z
    .object({ componentProps: z.record(z.string(), z.record(z.string(), z.unknown())) })
    .parse(await updated.json());
  const requests = Object.values(metadata.componentProps).filter(
    (props) => props['kind'] === 'request',
  );
  expect(requests).toHaveLength(1);
  expect(JSON.parse(z.string().parse(requests[0]?.['schema']))).toMatchObject({
    type: 'object',
    properties: { messages: { type: 'array' }, max_tokens: { type: 'integer' } },
  });
});
