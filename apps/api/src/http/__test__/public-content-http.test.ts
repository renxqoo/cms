import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  ContentDeliveryApi,
  PublicEnvelope,
  PublicModelCatalog,
  PublicIntegrationExamples,
} from '@new-cms/cms/content/delivery';
import { loadConfig } from '../../bootstrap/load-config.ts';
import { publicContentOperations } from '../../config/public-content-operations.ts';
import type { HttpEnvironment } from '../contract.ts';
import { errorResponse } from '../errors.ts';
import { requestLifecycle } from '../lifecycle.ts';
import { publicContentHandlers } from '../public-content-handlers.ts';
import { responseSecurityHeaders } from '../security-headers.ts';

const envelope: PublicEnvelope<PublicModelCatalog> = {
  contractVersion: 'oneaster-public.v1',
  locale: 'en',
  revision: 'abc123',
  data: {
    models: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    facets: {
      categories: [],
      developers: [],
      tasks: [],
      inputs: [],
      outputs: [],
      capabilities: [],
    },
  },
};
afterEach(() => vi.restoreAllMocks());

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Unexpected delivery operation'));
}

function fixture(methods: Partial<ContentDeliveryApi>) {
  const config = loadConfig({
    DATABASE_URL: 'postgresql:///postgres?host=/tmp',
    CMS_RATE_LIMIT_SECRET: 'public-http-test-only-shared-secret',
    API_ALLOWED_ORIGINS: 'https://client.example.test',
  });
  const app = new Hono<HttpEnvironment>();
  app.use('*', responseSecurityHeaders());
  const complete: ContentDeliveryApi = {
    createPreviewTicket: unavailable,
    revokePreviewTicket: unavailable,
    getInterface: unavailable,
    getHome: unavailable,
    listModels: unavailable,
    getModel: unavailable,
    getDocuments: unavailable,
    getIntegrations: unavailable,
    getPreviewModel: unavailable,
    getPreviewIntegrations: unavailable,
    revokePreview: unavailable,
    getPublicMedia: unavailable,
    getPreviewMedia: unavailable,
    exportContent: unavailable,
    ...methods,
  };
  const handlers = publicContentHandlers(complete);
  app.use(
    '*',
    requestLifecycle(config.http, { admitIp: () => Promise.resolve() }, publicContentOperations),
  );
  app.onError((error, c) => errorResponse(error, c.get('requestId')));
  for (const operation of publicContentOperations) {
    const handler = handlers.get(operation.id);
    if (!handler) throw new Error('Handler absent');
    app.on(operation.method, operation.path, handler);
  }
  return app;
}

it('serves direct public envelopes, preserves catalog sort and verifies a representation before 304', async () => {
  const calls: unknown[] = [];
  const app = fixture({
    listModels: (query: unknown) => {
      calls.push(query);
      return Promise.resolve(envelope);
    },
  });
  const first = await app.request('http://localhost/v1/public/models?locale=en&sort=title', {
    headers: { origin: 'https://client.example.test' },
  });
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual(envelope);
  expect(calls).toEqual([{ locale: 'en', sort: 'title' }]);
  expect(first.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
  const etag = `"${createHash('sha256').update(JSON.stringify(envelope)).digest('hex')}"`;
  expect(first.headers.get('etag')).toBe(etag);
  expect(first.headers.get('access-control-expose-headers')).toContain('ETag');
  const second = await app.request('http://localhost/v1/public/models', {
    headers: { 'if-none-match': `W/${etag}` },
  });
  expect(second.status).toBe(304);
  expect(await second.text()).toBe('');
  expect(calls).toHaveLength(2);
});

it('rejects duplicate, path-colliding, unknown query keys and grant-in-query before a delivery call', async () => {
  const getModel = vi.fn<ContentDeliveryApi['getModel']>();
  const app = fixture({ getModel });
  for (const query of ['locale=en&locale=zh', 'slug=other', 'mystery=true', 'grant=private']) {
    expect((await app.request(`http://localhost/v1/public/models/model?${query}`)).status).toBe(
      400,
    );
  }
  expect(getModel).not.toHaveBeenCalled();
});

it('hands opaque preview grants only from strict Bearer headers to the dedicated API', async () => {
  const calls: unknown[] = [];
  const previewEnvelope: PublicEnvelope<PublicIntegrationExamples> = {
    contractVersion: 'oneaster-public.v1',
    locale: 'en',
    revision: 'preview',
    data: {
      modelId: 'model',
      bindingKey: 'default',
      profileKey: 'core.chat',
      recipeKey: 'core.http',
      flowKey: 'chat.json',
      scenarioKey: 'simple',
      examples: [],
      agentInstructions: 'Use the declared model.',
      documentationUrl: null,
    },
  };
  const app = fixture({
    getPreviewIntegrations: (query: unknown) => {
      calls.push(query);
      return Promise.resolve({ expiresAt: '2026-10-27T12:00:00.000Z', content: previewEnvelope });
    },
  });
  const headers = { authorization: 'Bearer opaque-preview-grant' };
  for (const authorization of [
    '',
    'Basic opaque-preview-grant',
    'Bearer two words',
    'bearer opaque-preview-grant',
  ]) {
    expect(
      (
        await app.request('http://localhost/v1/preview/models/model/integrations?locale=en', {
          headers: { authorization },
        })
      ).status,
    ).toBe(401);
  }
  const logs: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    logs.push(String(chunk));
    return true;
  });
  const response = await app.request(
    'http://localhost/v1/preview/models/model/integrations?locale=en',
    {
      headers,
    },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(previewEnvelope);
  expect(calls).toEqual([{ slug: 'model', locale: 'en', grant: 'opaque-preview-grant' }]);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-preview-expires-at')).toBe('2026-10-27T12:00:00.000Z');
  expect(logs.join('')).not.toContain('opaque-preview-grant');
});

it('wraps preview revocation and rejects query or request bodies', async () => {
  const revokePreview = vi
    .fn<ContentDeliveryApi['revokePreview']>()
    .mockResolvedValue({ revoked: true });
  const app = fixture({ revokePreview });
  const headers = { authorization: 'Bearer opaque-preview-grant' };
  const response = await app.request('http://localhost/v1/preview/revoke', {
    method: 'POST',
    headers,
  });
  expect(await response.json()).toEqual({ success: true, data: { revoked: true } });
  expect(
    (await app.request('http://localhost/v1/preview/revoke?grant=x', { method: 'POST', headers }))
      .status,
  ).toBe(400);
  expect(
    (
      await app.request('http://localhost/v1/preview/revoke', {
        method: 'POST',
        headers,
        body: '{}',
      })
    ).status,
  ).toBe(400);
  expect(revokePreview).toHaveBeenCalledTimes(1);
});
it('accepts an empty Node POST body stream for revocation without accepting a nonempty stream', async () => {
  const revokePreview = vi
    .fn<ContentDeliveryApi['revokePreview']>()
    .mockResolvedValue({ revoked: true });
  const app = fixture({ revokePreview });
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('{}')]) {
    const response = await app.request('http://localhost/v1/preview/revoke', {
      method: 'POST',
      headers: { authorization: 'Bearer opaque-preview-grant' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          if (bytes.byteLength > 0) controller.enqueue(bytes);
          controller.close();
        },
      }),
    });
    expect(response.status).toBe(bytes.byteLength === 0 ? 200 : 400);
  }
  expect(revokePreview).toHaveBeenCalledTimes(1);
});

function mediaFixture() {
  let cancels = 0;
  const stream = () =>
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('0123456789'));
      },
      cancel() {
        cancels += 1;
      },
    });
  const app = fixture({
    getPublicMedia: () =>
      Promise.resolve({
        stream: stream(),
        filename: 'test.png',
        mimeType: 'image/png',
        bytes: 10,
        digest: 'digest',
      }),
    getPreviewMedia: () =>
      Promise.resolve({
        stream: stream(),
        filename: 'private.png',
        mimeType: 'image/png',
        bytes: 10,
        digest: 'digest',
      }),
  });
  return { app, cancels: () => cancels };
}

it('streams a single media range and closes sources for ranges, HEAD, 304 and invalid ranges', async () => {
  const kit = mediaFixture();
  const range = await kit.app.request(
    'http://localhost/v1/public/media/9c14df4b-d1d5-40ae-af56-445d831d7463',
    { headers: { range: 'bytes=3-6' } },
  );
  expect(range.status).toBe(206);
  expect(range.headers.get('content-range')).toBe('bytes 3-6/10');
  expect(range.headers.get('content-length')).toBe('4');
  expect(await range.text()).toBe('3456');
  const head = await kit.app.request(
    'http://localhost/v1/public/media/9c14df4b-d1d5-40ae-af56-445d831d7463',
    { method: 'HEAD' },
  );
  expect(head.headers.get('content-length')).toBe('10');
  expect(await head.text()).toBe('');
  expect(
    (
      await kit.app.request(
        'http://localhost/v1/public/media/9c14df4b-d1d5-40ae-af56-445d831d7463',
        { headers: { 'if-none-match': '"digest"' } },
      )
    ).status,
  ).toBe(304);
  const invalid = await kit.app.request(
    'http://localhost/v1/public/media/9c14df4b-d1d5-40ae-af56-445d831d7463',
    { headers: { range: 'bytes=20-30' } },
  );
  expect(invalid.status).toBe(416);
  expect(invalid.headers.get('content-range')).toBe('bytes */10');
  expect(kit.cancels()).toBe(4);
});

it('allows public pinned media to render on the client origin while private preview media remains isolated', async () => {
  const kit = mediaFixture();
  for (const method of ['GET', 'HEAD']) {
    const response = await kit.app.request(
      'http://localhost/v1/public/media/9c14df4b-d1d5-40ae-af56-445d831d7463',
      { method },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    await response.body?.cancel();
  }
  const preview = await kit.app.request(
    'http://localhost/v1/preview/media/9c14df4b-d1d5-40ae-af56-445d831d7463',
    {
      headers: { authorization: 'Bearer opaque-preview-grant' },
    },
  );
  expect(preview.status).toBe(200);
  expect(preview.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  expect(preview.headers.get('cache-control')).toBe('private, no-store');
  await preview.body?.cancel();
  const json = await fixture({ listModels: () => Promise.resolve(envelope) }).request(
    'http://localhost/v1/public/models',
  );
  expect(json.headers.get('cross-origin-resource-policy')).toBe('same-origin');
});

it('streams exact export frames with backpressure and aborts business work on consumer cancellation', async () => {
  let aborted = false;
  const app = fixture({
    exportContent: async (
      _input: unknown,
      write: (frame: Uint8Array) => Promise<void>,
      signal?: AbortSignal,
    ) => {
      await write(new TextEncoder().encode('{"type":"start"}\n'));
      await write(new TextEncoder().encode('{"type":"item"}\n'));
      await new Promise<void>((resolve) => {
        signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        );
      });
    },
  });
  const response = await app.request('http://localhost/v1/public/index?kind=documents&locale=en');
  expect(response.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
  const reader = response.body?.getReader();
  expect(new TextDecoder().decode((await reader?.read())?.value)).toBe('{"type":"start"}\n');
  await reader?.cancel();
  await vi.waitFor(() => expect(aborted).toBe(true));
});
