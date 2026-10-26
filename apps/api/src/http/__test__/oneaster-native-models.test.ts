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
