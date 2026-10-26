import type { Manifest, UploadSession, AssetJob } from '../../../contracts/assets';
import type { CollectionEditor } from '../../../contracts/editor';
import type { Collection } from '../../../contracts/content';
import type { Document } from '../../../contracts/documents';
import type { ApiResult } from '../../../api/result';

export const uploadId = '11111111-1111-4111-8111-111111111111';
export const documentId = '22222222-2222-4222-8222-222222222222';
export const versionId = '33333333-3333-4333-8333-333333333333';
export const manifest: Manifest = {
  id: '44444444-4444-4444-8444-444444444444',
  filename: 'source.png',
  mimeType: 'image/png',
  bytes: 8,
  digest: 'independent-digest',
  width: 200,
  height: 100,
  orientation: 1,
  processorVersion: 'processor',
  recipe: { variants: [] },
  objects: [
    {
      name: 'original',
      bytes: 8,
      digest: 'independent-digest',
      mimeType: 'image/png',
      width: 200,
      height: 100,
    },
    {
      name: 'thumb',
      bytes: 4,
      digest: 'thumb-digest',
      mimeType: 'image/webp',
      width: 20,
      height: 10,
    },
  ],
};
export function session(changes: Partial<UploadSession> = {}): UploadSession {
  return {
    id: uploadId,
    filename: 'source.png',
    declaredMimeType: 'image/png',
    declaredBytes: 8,
    createdAt: '2026-10-26T00:00:00.000Z',
    collection: 'media',
    purpose: 'create',
    documentId: null,
    revision: null,
    status: 'pending',
    expiresAt: '2026-10-27T00:00:00.000Z',
    failureCode: null,
    manifest: null,
    jobId: null,
    ...changes,
  };
}
export const editor: CollectionEditor = {
  collection: 'media',
  schemaVersion: 1,
  behaviorHash: 'behavior',
  mappingFingerprint: 'mapping',
  intent: 'update',
  mode: 'editing',
  locale: 'en',
  fallback: [],
  richTextNodes: [],
  document: { id: documentId, revision: 7, versionId, trashedAt: null },
  locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: {} },
  layout: [],
  schemas: { read: {}, draft: {}, commit: {} },
  actions: [
    { operationId: 'documents.update', state: 'allowed' },
    { operationId: 'documents.create', state: 'allowed' },
  ],
  upload: {
    mimeTypes: ['image/png', 'application/pdf'],
    maxBytes: 1024,
    recipe: { variants: [] },
    maxOutputBytes: 1024,
    maxPixels: 100000,
    maxFrames: 1,
    maxWidth: 1000,
    maxHeight: 1000,
    maxVariants: 2,
    directUpload: false,
    multipart: false,
  },
};
export const collection: Collection = {
  key: 'media',
  label: 'Media',
  schemaVersion: 1,
  mode: 'direct',
  history: true,
  singleton: false,
  defaultLocale: 'en',
  locales: ['en', 'zh-CN'],
  dataSchema: {},
  fields: [],
  behaviorHash: 'behavior',
  mappingFingerprint: 'mapping',
  upload: true,
  capabilities: {
    autosave: false,
    publication: false,
    schedules: false,
    history: true,
    trash: true,
    purge: true,
  },
};
export const document: Document = {
  id: documentId,
  collection: 'media',
  revision: 7,
  versionId,
  publishedVersionId: null,
  trashedAt: null,
  folderId: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  data: { title: 'Source' },
  file: manifest,
  mediaBindings: [],
};
export function job(changes: Partial<AssetJob> = {}): AssetJob {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    collection: 'media',
    action: 'reprocess',
    status: 'queued',
    attempts: 0,
    failureCode: null,
    uploadId,
    manifest: null,
    ...changes,
  };
}
export function success(data?: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, data, requestId: 'request-id' };
}
export function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  if (!resolve) throw new Error('Promise resolver was not installed.');
  return { promise, resolve };
}
