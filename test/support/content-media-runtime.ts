import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAssets } from '@new-cms/cms/assets/composition';
import { createContent } from '@new-cms/cms/content/composition';
import type { ContentOptions } from '@new-cms/cms/content/composition';
import type { AssetLimits } from '@new-cms/cms/assets/composition';
import { createLocalStorage } from '../../apps/api/src/adapters/storage/local.ts';
import { createSharpProcessor } from '../../apps/api/src/adapters/images/sharp.ts';
import { createContentFixture, workflowCollections } from './content-runtime.ts';
import type { FixtureOptions } from './content-runtime.ts';

const limits: AssetLimits = {
  maxUploadBytes: 20971520,
  maxOutputBytes: 20971520,
  maxPixels: 40000000,
  maxFrames: 1,
  maxWidth: 8192,
  maxHeight: 8192,
  uploadConcurrency: 2,
  uploadQueueSize: 2,
  uploadQueueTimeoutMs: 1000,
  uploadTimeoutMs: 60000,
  processingTimeoutMs: 5000,
  sessionTtlMs: 1800000,
  retentionMs: 604800000,
  leaseMs: 30000,
  jobAttempts: 3,
  maintenanceBatchSize: 20,
  maxVariants: 10,
  maxActiveSessionsPerActor: 100,
  maxActiveBytesPerActor: 1073741824,
  maxActiveSessions: 10000,
  maxActiveBytes: 21474836480,
};

export function mediaCollections() {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Article missing');
  article.fields = [
    ...article.fields,
    { id: 'cover', name: 'cover', type: 'upload', relationTo: ['media'] },
    { id: 'body', name: 'body', type: 'richText' },
  ];
  collections.push({
    id: 'workflow_media',
    key: 'media',
    schemaVersion: 1,
    label: 'Media',
    mode: 'direct',
    history: { maxVersions: 3, retentionMs: 0 },
    locales: { default: 'en', supported: ['en', 'zh'], fallback: { zh: ['en'] } },
    upload: {
      mimeTypes: ['image/png', 'application/pdf'],
      variants: [{ name: 'tiny', width: 2, height: 2, fit: 'inside' }],
    },
    fields: [
      { id: 'title', name: 'title', type: 'text', required: true, localized: true },
      { id: 'copyright', name: 'copyright', type: 'text' },
    ],
  });
  return collections;
}

function composeMedia(
  options: ContentOptions,
  input: { root: string; capture: { assets?: ReturnType<typeof createAssets> } },
) {
  const assets = createAssets({
    database: options.database,
    policy: options.policy,
    limits,
    resourceLockKey: options.workPolicy.resourceLockKey,
    authorize: options.authorize,
    authorizeActor: (tx, request) => options.authorizeActor(tx, request),
    authorizeContent: (tx, request) => content.authorizeMedia(tx, request),
    commitProcessing: (tx, request) => content.participants.commitProcessing(tx, request),
    storage: createLocalStorage({ root: input.root }),
    images: createSharpProcessor(),
  });
  const configured: ContentOptions = {
    ...options,
    assets: assets.participants,
    uploadApi: assets.api,
    readAssetJob: (ctx, request) => assets.api.readJob(ctx, request),
  };
  input.capture.assets = assets;
  const content = createContent(configured);
  return { content, options: configured, close: () => assets.close() };
}

export async function createContentMediaFixture(options: Omit<FixtureOptions, 'compose'> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'content-media-'));
  const capture: { assets?: ReturnType<typeof createAssets> } = {};
  try {
    const fixture = await createContentFixture({
      ...options,
      collections: options.collections ?? mediaCollections(),
      compose: (configuration) => composeMedia(configuration, { root, capture }),
    });
    const { assets } = capture;
    if (!assets) throw new Error('Assets missing');
    return {
      ...fixture,
      assets,
      root,
      close: async () => {
        try {
          await fixture.close();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await capture.assets?.close();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export type ContentMediaFixture = Awaited<ReturnType<typeof createContentMediaFixture>>;

export async function readyContentUpload(
  fixture: ContentMediaFixture,
  input: {
    collection?: string;
    bytes?: Uint8Array;
    target?: { documentId: string; revision: number };
  } = {},
) {
  const collection = input.collection ?? 'media';
  const bytes = input.bytes ?? new TextEncoder().encode('%PDF-1.7\nprivate original bytes\n%%EOF');
  const created = await fixture.assets.api.createUpload(fixture.owner(), {
    collection,
    purpose: input.target ? 'replace' : 'create',
    filename: 'original.pdf',
    mimeType: 'application/pdf',
    bytes: bytes.byteLength,
    ...input.target,
  });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  await fixture.assets.api.writeUpload(
    fixture.owner(),
    { collection, uploadId: created.id },
    stream,
  );
  const job = await fixture.assets.api.completeUpload(fixture.owner(), {
    collection,
    uploadId: created.id,
  });
  await fixture.assets.maintenance();
  const ready = await fixture.assets.api.readUpload(fixture.owner(), {
    collection,
    uploadId: created.id,
  });
  if (ready.status !== 'ready') throw new Error(`Upload failed: ${ready.failureCode}`);
  return { uploadId: created.id, jobId: job.jobId };
}
