import { presetEditorSchema } from '@new-cms/cms/content';
import { outputSchema } from './output-schema.ts';
import { adminPresentationSchemas } from './admin-presentation-schemas.ts';
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
    ContentValidation: object({
      valid: { type: 'boolean' },
      errors: array(object({ field: text, message: text }, { locale: text })),
    }),
    ContentDocument: object(document, documentProperties()),
    ContentDocumentPage: page('ContentDocument'),
    HierarchyPage: object({
      parentId: nullable(id),
      rows: array(reference('ContentDocument')),
      total: integer,
      page: integer,
      pageSize: integer,
    }),
    HierarchyMove: object({ rows: array(reference('ContentDocument')) }),
    ContentVersion: object(version),
    ContentVersionPage: page('ContentVersion'),
    ContentVersionDetail: object({ ...document, ...version }, documentProperties()),
    ContentVersionDiff: object(
      {
        from: id,
        to: id,
        changes: array(object({ field: text, before: {}, after: {} })),
      },
      { componentProps: reference('ContentComponentProps') },
    ),
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
          enum: [
            'eq',
            'ne',
            'in',
            'notIn',
            'exists',
            'gt',
            'gte',
            'lt',
            'lte',
            'contains',
            'all',
            'like',
            'notLike',
            'near',
            'within',
            'intersects',
          ],
        },
        value: {},
      }),
    ],
  };
}

function joinResponseSchemas(): Record<string, Schema> {
  return {
    ContentDistinctPage: object({
      rows: array({}),
      total: integer,
      page: integer,
      pageSize: integer,
    }),
    ContentGroupedDocumentPage: object({
      rows: array(
        object(
          { key: id, value: {}, documents: reference('ContentDocumentPage') },
          { label: text },
        ),
      ),
      total: integer,
      page: integer,
      pageSize: integer,
    }),
    ContentJoinPage: object(
      {
        rows: array({ oneOf: [reference('ContentDocument'), object({ collection: text, id })] }),
        page: integer,
        pageSize: integer,
        hasNextPage: { type: 'boolean' },
        sort: array(object({ field: text, order: { enum: ['asc', 'desc'] } })),
      },
      { total: integer, orderVersion: id },
    ),
  };
}

export function contentResponseSchemas(): Record<string, Schema> {
  return {
    ...documentSchemas(),
    ...joinResponseSchemas(),
    ...adminPresentationSchemas(),
    ContentWhere: querySchema(),
    ...queryPresetSchemas(),
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

function collectionCapabilities(): Schema {
  return object({
    autosave: { type: 'boolean' },
    publication: { type: 'boolean' },
    localizedPublication: { type: 'boolean' },
    schedules: { type: 'boolean' },
    history: { type: 'boolean' },
    trash: { const: true },
    purge: { const: true },
  });
}
function collectionFieldSchema(): Schema {
  return object(
    {
      id: text,
      path: text,
      type: text,
      label: text,
      required: { type: 'boolean' },
      localized: { type: 'boolean' },
      queryable: { type: 'boolean' },
      sortable: { type: 'boolean' },
      groupable: { type: 'boolean' },
    },
    {
      components: reference('AdminFieldComponents'),
      disabled: reference('AdminAreas'),
      options: array({
        oneOf: [
          text,
          object({
            value: text,
            label: { oneOf: [text, { type: 'object', additionalProperties: text }] },
          }),
        ],
      }),
    },
  );
}
function collectionSchemas(): Record<string, Schema> {
  return {
    ContentDocumentOrderState: object({ version: id }),
    ContentCollection: object(
      {
        key: text,
        label: text,
        enableQueryPresets: { type: 'boolean' },
        queryPresetConstraints: object({
          read: array(object({ value: text, label: text, dataSchema: {} })),
          update: array(object({ value: text, label: text, dataSchema: {} })),
          delete: array(object({ value: text, label: text, dataSchema: {} })),
        }),
        schemaVersion: integer,
        mode: { enum: ['direct', 'drafts'] },
        drafts: draftConfiguration(),
        history: { type: 'boolean' },
        singleton: { type: 'boolean' },
        disableBulkEdit: { type: 'boolean' },
        disableBulkDelete: { type: 'boolean' },
        disableDuplicate: { type: 'boolean' },
        hierarchy: hierarchySchema(),
        orderable: { type: 'boolean' },
        authorship: object({
          createdBy: { type: 'boolean' },
          updatedBy: { type: 'boolean' },
          queryable: { type: 'boolean' },
        }),
        defaultLocale: text,
        locales: array(text),
        defaultSort: array(object({ field: text, order: { enum: ['asc', 'desc'] } })),
        dataSchema: { type: 'object' },
        componentVersions: { type: 'object', additionalProperties: text },
        fields: array(collectionFieldSchema()),
        behaviorHash: text,
        mappingFingerprint: text,
        upload: { type: 'boolean' },
        capabilities: collectionCapabilities(),
      },
      {
        componentProps: reference('ContentComponentProps'),
        labels: object({ singular: text, plural: text }),
        admin: collectionAdminSchema(),
      },
    ),
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
    ContentJob: object(
      {
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
      },
      {
        publicationAction: { enum: ['publish', 'unpublish'] },
        locale: text,
      },
    ),
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

function hierarchySchema(): Schema {
  return nullable(
    object(
      {
        kind: { enum: ['hierarchy', 'tags'] },
        parentFieldName: text,
        allowHasMany: { type: 'boolean' },
        treeLimit: integer,
        useHeaderButton: { type: 'boolean' },
        injectSidebarTab: { type: 'boolean' },
        relatedCollections: array(
          object({ collection: text, field: text, hasMany: { type: 'boolean' } }),
        ),
      },
      {
        slugPathFieldName: text,
        titlePathFieldName: text,
        typeFieldName: text,
        components: object(
          {},
          {
            Icon: reference('AdminComponentReference'),
            SmallIcon: reference('AdminComponentReference'),
          },
        ),
      },
    ),
  );
}

function documentProperties(): Record<string, Schema> {
  return {
    ...mediaProperties(),
    componentProps: reference('ContentComponentProps'),
    adminURL: nullable(text),
    createdBy: nullable(object({ id, displayName: nullable(text) })),
    updatedBy: nullable(object({ id, displayName: nullable(text) })),
  };
}

function draftConfiguration(): Schema {
  return nullable(
    object({
      validate: { type: 'boolean' },
      autosave: { oneOf: [{ const: false }, object({ intervalMs: integer })] },
      schedule: { type: 'boolean' },
    }),
  );
}

function collectionAdminSchema(): Schema {
  return object(
    {},
    {
      useAsTitle: text,
      useAsThumbnail: text,
      group: { oneOf: [{ const: false }, text] },
      hidden: { type: 'boolean' },
      pagination: object({}, { defaultLimit: integer, limits: array(integer) }),
      defaultColumns: array(text),
      description: text,
      meta: reference('AdminMetadata'),
      disableCopyToLocale: { type: 'boolean' },
      enableRichTextLink: { type: 'boolean' },
      enableRichTextRelationship: { type: 'boolean' },
      components: reference('AdminCollectionComponents'),
      views: array(reference('AdminView')),
    },
  );
}

function queryPresetSchemas(): Record<string, Schema> {
  return {
    ContentPresetEditor: outputSchema('ContentPresetEditor', presetEditorSchema),
    ContentQueryPreset: object({
      id,
      collection: text,
      ownerId: id,
      name: text,
      shared: { type: 'boolean' },
      access: object({
        read: presetAccessRule(),
        update: presetAccessRule(),
        delete: presetAccessRule(),
      }),
      permissions: object({
        read: { type: 'boolean' },
        update: { type: 'boolean' },
        delete: { type: 'boolean' },
      }),
      query: object(
        {
          q: text,
          sort: array(object({ field: text, order: { enum: ['asc', 'desc'] } })),
          columns: array(text),
        },
        {
          where: reference('ContentWhere'),
          groupBy: object({ field: text, order: { enum: ['asc', 'desc'] } }),
        },
      ),
      version: integer,
      createdAt: time,
      updatedAt: time,
    }),
    ContentQueryPresetPage: page('ContentQueryPreset'),
  };
}

function presetAccessRule(): Schema {
  return object(
    { constraint: text },
    { users: array(id), data: { type: 'object', additionalProperties: {} } },
  );
}
