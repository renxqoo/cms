import type { ApiResult } from '../../../api/result';
import type { Collection } from '../../../contracts/content';
import type { Document } from '../../../contracts/documents';
import type { CollectionEditor } from '../../../contracts/editor';
import type { EditorSnapshot } from '../editor-read';

export const documentId = '11111111-1111-4111-8111-111111111111';
export const versionId = '22222222-2222-4222-8222-222222222222';
export const nextVersionId = '33333333-3333-4333-8333-333333333333';
export const folderId = '44444444-4444-4444-8444-444444444444';
export function catalog(overrides: Partial<Collection> = {}): Collection {
  return {
    key: 'articles',
    label: 'Articles',
    schemaVersion: 1,
    mode: 'drafts',
    history: true,
    singleton: false,
    orderable: false,
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
    defaultSort: [{ field: 'updatedAt', order: 'desc' }],
    dataSchema: { type: 'object' },
    fields: [
      {
        id: 'title',
        path: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        localized: true,
        queryable: true,
        sortable: true,
      },
      {
        id: 'count',
        path: 'count',
        label: 'Count',
        type: 'number',
        required: false,
        localized: false,
        queryable: true,
        sortable: true,
      },
      {
        id: 'active',
        path: 'active',
        label: 'Active',
        type: 'boolean',
        required: false,
        localized: false,
        queryable: true,
        sortable: true,
      },
    ],
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    upload: false,
    drafts: { validate: true, autosave: { intervalMs: 10000 }, schedule: true },
    capabilities: {
      autosave: true,
      publication: true,
      schedules: true,
      history: true,
      trash: true,
      purge: true,
    },
    ...overrides,
  };
}
export function document(overrides: Partial<Document> = {}): Document {
  return {
    id: documentId,
    collection: 'articles',
    revision: 1,
    versionId,
    publishedVersionId: null,
    trashedAt: null,
    folderId: null,
    createdAt: '2026-10-26T01:00:00.000Z',
    updatedAt: '2026-10-26T01:00:00.000Z',
    data: { title: 'Server title' },
    ...overrides,
  };
}
export function editor(overrides: Partial<CollectionEditor> = {}): CollectionEditor {
  return {
    collection: 'articles',
    schemaVersion: 1,
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    intent: 'update',
    mode: 'editing',
    locale: 'en',
    fallback: ['en'],
    richTextNodes: [],
    initialData: null,
    initialSnapshot: null,
    visibility: {},
    componentVersions: {},
    document: { id: documentId, revision: 1, versionId, trashedAt: null },
    locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: { 'zh-CN': ['en'] } },
    layout: [
      {
        id: 'title',
        type: 'text',
        name: 'title',
        label: 'Title',
        path: 'title',
        required: true,
        localized: true,
        write: 'allowed',
        queryable: true,
        constraints: {},
      },
    ],
    schemas: { read: { type: 'object' }, draft: { type: 'object' }, commit: { type: 'object' } },
    actions: (
      [
        'documents.update',
        'documents.create',
        'documents.autosave',
        'documents.publish',
        'documents.unpublish',
        'documents.copy',
        'documents.archive',
        'versions.restore',
        'content.schedulePublication',
      ] as const
    ).map((operationId) => ({ operationId, state: 'allowed' as const })),
    upload: null,
    ...overrides,
  };
}
export function snapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return { collection: catalog(), editor: editor(), document: document(), ...overrides };
}
export function success<T>(data: T): ApiResult<T> {
  return { ok: true, status: 200, data, requestId: 'request-1' };
}
export function deferred<T>() {
  let accept: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    accept = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!accept) throw new Error('The promise has not initialized.');
      accept(value);
    },
  };
}
