import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';
import {
  bindPublicCollections,
  editorialFixture,
  nativeDocument,
  publishNative,
} from './native-publication-support.ts';
let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('publishes native site, curated home and every non-image document block without leaking draft references', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  await bindPublicCollections(kit, ['home', 'site', 'documents', 'models']);
  await publishNative(kit, 'site', editorialFixture('site'));
  await publishNative(kit, 'documents', nativeDocument());
  const modelData = {
    modelId: 'Display/Only',
    slug: 'display-only',
    title: 'Display only',
    summary: 'An explanatory model',
    contentLocales: ['en'],
    primaryCategory: 'text',
    technicalCapabilities: { inputs: ['text'], outputs: ['text'], tasks: ['chat'], features: [] },
    apiBindings: [],
    showcase: [
      {
        key: 'answer',
        title: 'Published answer',
        mediaType: 'text',
        outputText: 'x'.repeat(60000),
        provenance: { kind: 'model-output', sourceLabel: 'Reviewed output' },
      },
    ],
  };
  const model = await publishNative(kit, 'models', modelData);
  const home = editorialFixture('home');
  const featured = z.record(z.string(), z.json()).parse(home['featuredModels']);
  featured['models'] = [{ collection: 'models', id: model.id }];
  home['featuredModels'] = featured;
  await publishNative(kit, 'home', home);
  const request = api(kit);
  const response = await request('GET', '/v1/public/home?locale=en', { token: null });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: {
      featuredModels: [{ modelId: 'Display/Only' }],
      home: {
        data: { hero: { apiExample: { baseUrl: 'https://gateway.example.com/v1' } } },
        seo: { title: 'One API. Access leading AI models.' },
      },
    },
  });
  const document = await request('GET', '/v1/public/docs/native-guide?locale=en', { token: null });
  expect(document.status).toBe(200);
  expect(await document.json()).toMatchObject({
    data: {
      document: {
        body: {
          version: 'docs-body.v1',
          introduction: {
            anchor: 'docs-title',
            eyebrow: null,
            callout: { id: 'docs-introduction-callout' },
          },
          sections: [
            {
              navigationLabel: 'Quickstart',
              blocks: [
                { type: 'richText' },
                { type: 'callout' },
                { type: 'steps' },
                { type: 'code', caption: null },
                { type: 'codeTabs', caption: null },
                { type: 'endpoint' },
                { type: 'fieldTable' },
                { type: 'accordion' },
                { type: 'cta', eyebrow: null },
              ],
            },
          ],
          next: { id: 'docs-next', eyebrow: null },
        },
      },
    },
  });
  const detail = await request('GET', '/v1/public/models/display-only?locale=en', { token: null });
  expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({
    data: {
      model: {
        showcase: [
          {
            key: 'answer',
            description: '',
            prompt: '',
            media: null,
            poster: null,
            alt: '',
            outputText: 'x'.repeat(60000),
            settings: {},
            provenance: { sourceUrl: null, createdAt: null },
          },
        ],
      },
    },
  });
});

it('rejects incomplete native home, site and document publication while leaving the draft editable', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  await bindPublicCollections(kit, ['home', 'site', 'documents']);
  const request = api(kit);
  for (const [collection, data] of [
    ['home', { contentLocales: ['en'] }],
    ['site', { title: 'Site', description: 'Description', contentLocales: ['en'] }],
    [
      'documents',
      {
        slug: 'incomplete',
        title: 'Guide',
        summary: 'Summary',
        contentLocales: ['en'],
        body: { sections: [] },
      },
    ],
  ] as const) {
    const created = await request('POST', `/v1/collections/${collection}/documents`, {
      body: { locale: 'en', data },
    });
    expect(created.status).toBe(201);
    const document = z.object({ id: z.uuid(), revision: z.number() }).parse(await created.json());
    const published = await request(
      'POST',
      `/v1/collections/${collection}/documents/${document.id}/publications`,
      { body: { locale: 'en', revision: document.revision } },
    );
    expect(published.status).toBe(400);
    expect(
      (await request('GET', `/v1/collections/${collection}/documents/${document.id}`)).status,
    ).toBe(200);
  }
});
it('rejects an invalid default document slug and negative document order before they poison public navigation', async () => {
  const kit = await createHttpFixture();
  fixture = kit;
  await bindPublicCollections(kit, ['site', 'documents']);
  const request = api(kit);
  const invalidSite = { ...editorialFixture('site'), defaultDocumentSlug: 'Bad/route' };
  const invalidDocument = { ...nativeDocument(), order: -1 };
  for (const [collection, data] of [
    ['site', invalidSite],
    ['documents', invalidDocument],
  ] as const) {
    const created = await request('POST', `/v1/collections/${collection}/documents`, {
      body: { locale: 'en', data },
    });
    expect(created.status).toBe(400);
  }
});
