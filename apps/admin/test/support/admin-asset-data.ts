import type { ApiResult } from '../../src/api/result';
import type { UploadSession } from '../../src/contracts/assets';
import type { AssetBudget } from '../../src/features/assets/document-asset-types';
import type { Collection, Document } from '../../src/contracts/content';
import type { CollectionEditor } from '../../src/contracts/editor';

export const first = '019aad44-1df0-7000-8000-000000000001';
export const second = '019aad44-1df0-7000-8000-000000000002';
export const manifest = {
  id: first,
  filename: 'image.png',
  mimeType: 'image/png',
  bytes: 4,
  digest: 'digest',
  width: 40,
  height: 30,
  orientation: 1,
  processorVersion: '1',
  recipe: { variants: [] },
  objects: [
    { name: 'original', bytes: 4, digest: 'digest', mimeType: 'image/png', width: 40, height: 30 },
  ],
};
export const budget: AssetBudget = {
  mimeTypes: ['image/png'],
  maxBytes: 100,
  recipe: { variants: [] },
  maxOutputBytes: 1000,
  maxPixels: 10000,
  maxFrames: 1,
  maxWidth: 100,
  maxHeight: 100,
  maxVariants: 5,
  directUpload: false,
  multipart: false,
};
export function session(overrides: Partial<UploadSession> = {}): UploadSession {
  return {
    id: first,
    filename: 'image.png',
    declaredMimeType: 'image/png',
    declaredBytes: 4,
    createdAt: '2026-10-26T00:00:00.000Z',
    collection: 'images',
    purpose: 'create',
    documentId: null,
    revision: null,
    status: 'pending',
    expiresAt: '2030-01-01T00:00:00.000Z',
    failureCode: null,
    manifest: null,
    jobId: null,
    ...overrides,
  };
}
export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, status: 200, requestId: 'request', data };
}
export function file(name = 'image.png') {
  return new File(['data'], name, { type: 'image/png' });
}
export function visibility() {
  const target = new EventTarget();
  return {
    visibilityState: 'visible' as const,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
}
export function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    finish(value: T) {
      if (!resolve) throw new Error('No resolver');
      resolve(value);
    },
  };
}

export const collection: Collection = {
  key: 'images',
  label: 'Images',
  schemaVersion: 1,
  mode: 'drafts',
  history: true,
  singleton: false,
  locales: ['en', 'zh-CN'],
  dataSchema: {},
  fields: [],
  behaviorHash: 'behavior',
  mappingFingerprint: 'mapping',
  upload: true,
  capabilities: {
    autosave: true,
    publication: true,
    schedules: true,
    history: true,
    trash: true,
    purge: true,
  },
};
export const resource: Document = {
  id: first,
  collection: 'images',
  revision: 9,
  versionId: second,
  publishedVersionId: null,
  trashedAt: null,
  folderId: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:01:00.000Z',
  data: {},
  file: manifest,
};
export const metadata: CollectionEditor = {
  collection: 'images',
  schemaVersion: 1,
  behaviorHash: 'behavior',
  mappingFingerprint: 'mapping',
  intent: 'create',
  mode: 'editing',
  locale: 'en',
  fallback: [],
  richTextNodes: [],
  document: null,
  locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: {} },
  layout: [],
  schemas: { read: {}, draft: {}, commit: {} },
  actions: [{ operationId: 'documents.create', state: 'allowed' }],
  upload: budget,
};
export function page<T>(rows: T[], total = rows.length, pagination = { page: 1, pageSize: 20 }) {
  return { rows, total, ...pagination };
}
