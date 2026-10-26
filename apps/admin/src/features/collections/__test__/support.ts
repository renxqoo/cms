import type { EditorSnapshot } from '../read-editor';

export const id = '10000000-0000-4000-8000-000000000001';
export const versionId = '20000000-0000-4000-8000-000000000001';
export const time = '2026-10-26T00:00:00.000Z';
export function snapshot(revision = 3, title = 'Original'): EditorSnapshot {
  const document = {
    id,
    collection: 'articles',
    revision,
    versionId,
    publishedVersionId: null,
    trashedAt: null,
    folderId: null,
    createdAt: time,
    updatedAt: time,
    data: { title, slug: 'original' },
  };
  return {
    collection: {
      key: 'articles',
      label: 'Articles',
      schemaVersion: 1,
      mode: 'drafts',
      history: true,
      singleton: false,
      locales: ['en', 'zh-CN'],
      dataSchema: {},
      fields: [
        {
          id: 'title',
          path: 'title',
          type: 'text',
          label: 'Title',
          required: true,
          localized: true,
          queryable: true,
        },
      ],
      behaviorHash: 'behavior',
      mappingFingerprint: 'mapping',
      upload: false,
      capabilities: {
        autosave: true,
        publication: true,
        schedules: true,
        history: true,
        trash: true,
        purge: true,
      },
    },
    editor: {
      collection: 'articles',
      schemaVersion: 1,
      behaviorHash: 'behavior',
      mappingFingerprint: 'mapping',
      intent: 'update',
      mode: 'editing',
      locale: 'en',
      fallback: [],
      richTextNodes: [],
      document: { id, revision, versionId, trashedAt: null },
      locales: { default: 'en', supported: ['en', 'zh-CN'], fallback: { en: [], 'zh-CN': ['en'] } },
      layout: [
        {
          id: 'title',
          name: 'title',
          path: 'title',
          type: 'text',
          label: 'Title',
          required: true,
          localized: true,
          write: 'allowed',
          constraints: {},
        },
        {
          id: 'slug',
          name: 'slug',
          path: 'slug',
          type: 'text',
          label: 'Slug',
          required: true,
          localized: false,
          write: 'allowed',
          constraints: {},
        },
      ],
      schemas: { read: {}, draft: {}, commit: {} },
      actions: [
        { operationId: 'documents.create', state: 'allowed' },
        { operationId: 'documents.update', state: 'allowed' },
        { operationId: 'documents.autosave', state: 'allowed' },
        { operationId: 'documents.publish', state: 'conditional' },
        { operationId: 'documents.unpublish', state: 'allowed' },
        { operationId: 'documents.archive', state: 'allowed' },
        { operationId: 'documents.copy', state: 'allowed' },
        { operationId: 'versions.restore', state: 'allowed' },
        { operationId: 'content.schedulePublication', state: 'allowed' },
        { operationId: 'content.cancelPublicationSchedule', state: 'allowed' },
      ],
      upload: null,
    },
    document,
    upload: null,
  };
}
export function newSnapshot(): EditorSnapshot {
  const value = snapshot();
  return {
    ...value,
    document: null,
    editor: { ...value.editor, intent: 'create', document: null },
  };
}
