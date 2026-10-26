import { z } from 'zod';
import { assetManifestSchema, contentJobSchema } from './assets';

export const collectionFieldSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.string(),
  label: z.string(),
  required: z.boolean(),
  localized: z.boolean(),
  queryable: z.boolean(),
  options: z.array(z.string()).optional(),
});

export const collectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  schemaVersion: z.number().int().positive(),
  mode: z.enum(['direct', 'drafts']),
  history: z.boolean(),
  singleton: z.boolean(),
  locales: z.array(z.string()),
  dataSchema: z.record(z.string(), z.unknown()),
  fields: z.array(collectionFieldSchema),
  behaviorHash: z.string(),
  mappingFingerprint: z.string(),
  upload: z.boolean(),
  capabilities: z.object({
    autosave: z.boolean(),
    publication: z.boolean(),
    schedules: z.boolean(),
    history: z.boolean(),
    trash: z.literal(true),
    purge: z.literal(true),
  }),
});

export const collectionListSchema = z.object({ rows: z.array(collectionSchema) });
export type Collection = z.infer<typeof collectionSchema>;
export type CollectionField = z.infer<typeof collectionFieldSchema>;

const documentId = z.uuid();
const revision = z.number().int().positive();
const timestamp = z.iso.datetime();
export const documentSchema = z.object({
  id: documentId,
  collection: z.string(),
  revision,
  versionId: documentId,
  publishedVersionId: documentId.nullable(),
  trashedAt: timestamp.nullable(),
  folderId: documentId.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  data: z.record(z.string(), z.json()),
  file: assetManifestSchema.optional(),
  mediaBindings: z
    .array(
      z.object({
        bindingId: documentId,
        sourcePath: z.string(),
        mediaDocumentId: documentId,
        mediaCollectionKey: z.string(),
        manifest: assetManifestSchema,
      }),
    )
    .optional(),
});
const pagination = { total: z.number().int().nonnegative(), page: revision, pageSize: revision };
export const documentListSchema = z.object({ rows: z.array(documentSchema), ...pagination });
export const versionSchema = z.object({
  id: documentId,
  revision,
  schemaVersion: revision,
  kind: z.string(),
  actorId: documentId,
  createdAt: timestamp,
});
export const versionListSchema = z.object({ rows: z.array(versionSchema), ...pagination });
export const versionDetailSchema = documentSchema.extend({
  schemaVersion: revision,
  kind: z.string(),
  actorId: documentId,
});
export const versionDiffSchema = z.object({
  from: documentId,
  to: documentId,
  changes: z.array(z.object({ field: z.string(), before: z.json(), after: z.json() })),
});
export const folderSchema = z.object({
  id: documentId,
  parentId: documentId.nullable(),
  name: z.string(),
  version: revision,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const folderTreeSchema = folderSchema.extend({
  get children() {
    return z.array(folderTreeSchema);
  },
});
export const folderListSchema = z.object({ rows: z.array(folderTreeSchema) });
export const purgeSchema = z.object({ id: documentId, purged: z.literal(true) });
export const contentAcceptedSchema = z.object({
  jobId: documentId,
  status: z.enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']),
  location: z.string(),
});
export const contentBatchSchema = z.union([contentJobSchema, contentAcceptedSchema]);
export type Document = z.infer<typeof documentSchema>;
export type DocumentPage = z.infer<typeof documentListSchema>;
export type Version = z.infer<typeof versionSchema>;
export type VersionDetail = z.infer<typeof versionDetailSchema>;
export type VersionDiff = z.infer<typeof versionDiffSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type FolderTree = z.infer<typeof folderTreeSchema>;
