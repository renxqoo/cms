import { array, id, integer, nullable, object, page, reference, text, time } from './schema.ts';
import type { Schema } from './schema.ts';

function documentSchemas(): Record<string, Schema> {
  const document = {
    id,
    collection: text,
    revision: integer,
    versionId: id,
    publishedVersionId: nullable(id),
    trashedAt: nullable(time),
    folderId: nullable(id),
    createdAt: time,
    updatedAt: time,
    data: reference('ContentData'),
  };
  const version = {
    id,
    revision: integer,
    schemaVersion: integer,
    kind: text,
    actorId: id,
    createdAt: time,
  };
  return {
    ContentData: { type: 'object' },
    ContentDocument: object(document, mediaProperties()),
    ContentDocumentPage: page('ContentDocument'),
    ContentVersion: object(version),
    ContentVersionPage: page('ContentVersion'),
    ContentVersionDetail: object({ ...document, ...version }, mediaProperties()),
    ContentVersionDiff: object({
      from: id,
      to: id,
      changes: array(object({ field: text, before: {}, after: {} })),
    }),
  };
}

function querySchema(): Schema {
  const children = array(reference('ContentWhere'));
  return {
    anyOf: [
      object({ and: { ...children, minItems: 1 } }),
      object({ or: { ...children, minItems: 1 } }),
      object({
        field: text,
        operator: {
          enum: ['eq', 'ne', 'in', 'notIn', 'exists', 'gt', 'gte', 'lt', 'lte', 'contains'],
        },
        value: {},
      }),
    ],
  };
}

export function contentResponseSchemas(): Record<string, Schema> {
  return {
    ...documentSchemas(),
    ContentWhere: querySchema(),
    ContentPurge: object({ id, purged: { const: true } }),
    ...collectionSchemas(),
    ...jobSchemas(),
    ContentReference: object({ collection: text, id, versionId: id, sourcePath: text }),
    ContentReferencePage: page('ContentReference'),
    ContentFolder: object({
      id,
      parentId: nullable(id),
      name: text,
      version: integer,
      createdAt: time,
      updatedAt: time,
    }),
    ContentFolderTree: object({
      id,
      parentId: nullable(id),
      name: text,
      version: integer,
      createdAt: time,
      updatedAt: time,
      children: array(reference('ContentFolderTree')),
    }),
    ContentFolderList: object({ rows: array(reference('ContentFolderTree')) }),
  };
}

function collectionSchemas(): Record<string, Schema> {
  const field = object(
    {
      id: text,
      path: text,
      type: text,
      label: text,
      required: { type: 'boolean' },
      localized: { type: 'boolean' },
      queryable: { type: 'boolean' },
    },
    { options: array(text) },
  );
  return {
    ContentCollection: object({
      key: text,
      label: text,
      schemaVersion: integer,
      mode: { enum: ['direct', 'drafts'] },
      history: { type: 'boolean' },
      singleton: { type: 'boolean' },
      defaultLocale: text,
      locales: array(text),
      dataSchema: { type: 'object' },
      fields: array(field),
      behaviorHash: text,
      mappingFingerprint: text,
      upload: { type: 'boolean' },
      capabilities: object({
        autosave: { type: 'boolean' },
        publication: { type: 'boolean' },
        localizedPublication: { type: 'boolean' },
        schedules: { type: 'boolean' },
        history: { type: 'boolean' },
        trash: { const: true },
        purge: { const: true },
      }),
    }),
    ContentCollectionList: object({ rows: array(reference('ContentCollection')) }),
  };
}
function jobSchemas(): Record<string, Schema> {
  const status = { enum: ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'] };
  const item = object(
    { position: integer, id, status: { enum: ['queued', 'succeeded', 'failed', 'cancelled'] } },
    { resultId: id, versionId: id, error: object({ code: text }) },
  );
  return {
    ContentJob: object({
      kind: { const: 'content' },
      id,
      collection: text,
      action: { enum: ['batch', 'publication', 'extension'] },
      status,
      documentId: nullable(id),
      expectedRevision: nullable(integer),
      requestedVersionId: nullable(id),
      executeAt: time,
      createdAt: time,
      finishedAt: nullable(time),
      total: integer,
      succeeded: integer,
      failed: integer,
      items: array(item),
    }),
    ContentJobAccepted: object({ jobId: id, status, location: text }),
    ContentBatchResult: { anyOf: [reference('ContentJob'), reference('ContentJobAccepted')] },
    ContentJobResult: { anyOf: [reference('ContentJob'), reference('AssetJob')] },
  };
}

function mediaProperties(): Record<string, Schema> {
  return {
    file: reference('AssetManifest'),
    mediaBindings: array(
      object({
        bindingId: id,
        sourcePath: text,
        mediaDocumentId: id,
        mediaCollectionKey: text,
        manifest: reference('AssetManifest'),
      }),
    ),
  };
}
