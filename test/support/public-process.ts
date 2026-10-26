import { expect } from 'vitest';
import { z } from 'zod';
import { contentDocument, waitForJob } from './cms-api.ts';
import type { ApiClient } from './cms-api.ts';
import type { createCmsProcess } from './cms-process.ts';
import { png } from './png.ts';

export function nativeChatModel(overrides: Record<string, unknown> = {}) {
  return {
    modelId: 'Native/Chat',
    slug: 'native-chat',
    title: 'Native chat',
    summary: 'Published chat instructions',
    contentLocales: ['en'],
    primaryCategory: 'text',
    technicalCapabilities: { inputs: ['text'], outputs: ['text'], tasks: ['chat'], features: [] },
    apiBindings: [
      {
        key: 'chat',
        profileKey: 'core.chat',
        inputModalities: ['text'],
        outputModalities: ['text'],
        capabilities: [],
        enabledFlowKeys: ['chat.json'],
        recipeKeys: ['core.http'],
        defaultScenarioKey: 'hello',
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
    ...overrides,
  };
}
export async function publishPublicDocument(
  request: ApiClient,
  input: { token: string; collection: string; data: unknown },
) {
  const created = await request('POST', `/v1/collections/${input.collection}/documents`, {
    token: input.token,
    body: { locale: 'en', data: input.data },
  });
  expect(created.status, await created.clone().text()).toBe(201);
  const document = contentDocument.parse(await created.json());
  const published = await request(
    'POST',
    `/v1/collections/${input.collection}/documents/${document.id}/publications`,
    { token: input.token, body: { locale: 'en', revision: document.revision } },
  );
  expect(published.status, await published.clone().text()).toBe(200);
  return contentDocument.parse(await published.json());
}
export async function uploadPublicLogo(kit: Awaited<ReturnType<typeof createCmsProcess>>) {
  const bytes = png([40, 100, 200]);
  const created = await kit.request('POST', '/v1/collections/media/uploads', {
    ...kit.owner,
    body: {
      purpose: 'create',
      filename: 'public-logo.png',
      mimeType: 'image/png',
      bytes: bytes.byteLength,
    },
  });
  expect(created.status).toBe(201);
  const upload = z.object({ id: z.uuid() }).parse(await created.json());
  const written = await fetch(
    `http://127.0.0.1:${kit.port()}/v1/collections/media/uploads/${upload.id}/content`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${kit.owner.token}`,
        'content-type': 'application/octet-stream',
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(10000),
    },
  );
  expect(written.status).toBe(200);
  const completed = await kit.request(
    'POST',
    `/v1/collections/media/uploads/${upload.id}/completions`,
    { ...kit.owner, body: {} },
  );
  expect(completed.status).toBe(202);
  const job = z.object({ jobId: z.uuid() }).parse(await completed.json());
  await waitForJob(kit.request, {
    ...kit.owner,
    collection: 'media',
    jobId: job.jobId,
    status: 'succeeded',
  });
  const response = await kit.request('POST', '/v1/collections/media/documents', {
    ...kit.owner,
    body: { locale: 'en', uploadId: upload.id, data: { title: 'Public logo', alt: 'Blue logo' } },
  });
  expect(response.status).toBe(201);
  return { document: contentDocument.parse(await response.json()), bytes };
}
