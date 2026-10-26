import { z } from 'zod';
import { editorInputSchema } from './editor/input.ts';

export interface ContentInputLimits {
  defaultPageSize: number;
  maxPageSize: number;
  maxBatchItems: number;
  maxLocales: number;
  maxFields: number;
  maxQueryNodes: number;
}

const id = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(2_147_483_647);
const collection = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const locale = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/);
const data = z.record(z.string(), z.unknown());
const scope = { collection };
const target = { ...scope, id };
const mutation = { ...target, revision };
const localized = { locale: locale.optional() };
function readShape(limits: ContentInputLimits) {
  return {
    ...localized,
    fallback: z.array(locale).max(limits.maxLocales).optional(),
    mode: z.enum(['editing', 'published']).default('editing'),
    select: z.array(z.string().min(1).max(256)).max(limits.maxFields).optional(),
    depth: z.number().int().min(0).optional(),
  };
}

const file = { uploadId: id.optional() };
const folder = { folderId: id.nullable().optional() };

function listShape(limits: ContentInputLimits) {
  return {
    page: z.number().int().min(1).max(2_147_483_647).default(1),
    pageSize: z.number().int().min(1).max(limits.maxPageSize).default(limits.defaultPageSize),
    q: z.string().max(256).optional(),
    where: z.unknown().optional(),
    sort: z
      .array(z.strictObject({ field: z.string().min(1).max(256), order: z.enum(['asc', 'desc']) }))
      .max(limits.maxQueryNodes)
      .optional(),
    trashed: z.boolean().default(false),
    folderId: id.nullable().optional(),
  };
}

function localeData(limits: ContentInputLimits) {
  return z
    .record(locale, data)
    .refine(
      (value) => Object.keys(value).length > 0 && Object.keys(value).length <= limits.maxLocales,
    )
    .meta({ minProperties: 1, maxProperties: limits.maxLocales });
}

function createSchema(limits: ContentInputLimits) {
  return z.union([
    z.strictObject({ ...scope, ...localized, data, ...file, ...folder }),
    z.strictObject({ ...scope, dataByLocale: localeData(limits), ...file, ...folder }),
  ]);
}

function updateSchema(limits: ContentInputLimits) {
  const patch = data.refine((value) => Object.keys(value).length > 0).meta({ minProperties: 1 });
  return z.union([
    z
      .strictObject({ ...mutation, ...localized, data: patch.optional(), ...file, ...folder })
      .refine(
        (value) =>
          value.data !== undefined || value.uploadId !== undefined || value.folderId !== undefined,
      )
      .meta({
        anyOf: [{ required: ['data'] }, { required: ['uploadId'] }, { required: ['folderId'] }],
      }),
    z.strictObject({ ...mutation, dataByLocale: localeData(limits), ...file, ...folder }),
  ]);
}

function documentSchemas(limits: ContentInputLimits) {
  return {
    'documents.list': z.strictObject({ ...scope, ...readShape(limits), ...listShape(limits) }),
    'documents.create': createSchema(limits),
    'documents.get': z.strictObject({ ...target, ...readShape(limits) }),
    'documents.update': updateSchema(limits),
    'documents.archive': z.strictObject(mutation),
    'documents.copy': z.union([
      z.strictObject({ ...mutation, ...localized, data: data.optional(), ...folder }),
      z.strictObject({ ...mutation, dataByLocale: localeData(limits), ...folder }),
    ]),
    'documents.restoreTrash': z.strictObject(mutation),
    'documents.purge': z.strictObject(mutation),
    'documents.autosave': z.union([
      z.strictObject({ ...mutation, ...localized, data, ...file }),
      z.strictObject({ ...mutation, dataByLocale: localeData(limits), ...file }),
    ]),
    'documents.publish': z.strictObject({ ...mutation, ...localized }),
    'documents.unpublish': z.strictObject({ ...mutation, ...localized }),
  };
}

function versionSchemas(limits: ContentInputLimits) {
  const read = readShape(limits);
  return {
    'versions.list': z.strictObject({
      ...target,
      ...localized,
      page: listShape(limits).page,
      pageSize: listShape(limits).pageSize,
    }),
    'versions.get': z.strictObject({
      ...target,
      versionId: id,
      ...localized,
      mode: read.mode,
      fallback: read.fallback,
      select: read.select,
      depth: read.depth,
    }),
    'versions.restore': z.strictObject({ ...mutation, versionId: id, ...localized }),
    'versions.diff': z.strictObject({ ...target, from: id, to: id, ...localized }),
  };
}

function batchSchema(limits: ContentInputLimits) {
  const item = { id, revision };
  const maximum = limits.maxBatchItems;
  const array = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).max(maximum);
  return z.union([
    z.strictObject({
      ...scope,
      action: z.literal('update'),
      ...localized,
      items: array(z.strictObject({ ...item, data })),
    }),
    z.strictObject({
      ...scope,
      action: z.literal('copy'),
      ...localized,
      items: array(z.strictObject({ ...item, data: data.optional() })),
    }),
    z.strictObject({
      ...scope,
      action: z.enum(['archive', 'restoreTrash']),
      items: array(z.strictObject(item)),
    }),
    z.strictObject({
      ...scope,
      action: z.enum(['update', 'copy']),
      items: array(z.strictObject({ ...item, dataByLocale: localeData(limits) })),
    }),
  ]);
}

function taskSchemas(limits: ContentInputLimits) {
  return {
    'content.schedulePublication': z.strictObject({
      ...mutation,
      ...localized,
      versionId: id,
      action: z.enum(['publish', 'unpublish']).default('publish'),
      executeAt: z.iso.datetime(),
    }),
    'content.cancelPublicationSchedule': z.strictObject({ ...target, scheduleId: id }),
    'content.getJob': z.strictObject({ ...scope, jobId: id }),
    'content.listJobs': z.strictObject({
      ...scope,
      page: listShape(limits).page,
      pageSize: listShape(limits).pageSize,
      action: z.enum(['batch', 'publication', 'extension', 'process', 'reprocess']).optional(),
      status: z
        .enum(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'])
        .optional(),
      documentId: id.optional(),
    }),
    'content.batch': batchSchema(limits),
  };
}

export function contentInputSchemas(limits: ContentInputLimits) {
  return {
    ...documentSchemas(limits),
    ...versionSchemas(limits),
    ...taskSchemas(limits),
    'collections.list': z.strictObject({}),
    'collections.get': z.strictObject(scope),
    'collections.editor': editorInputSchema(limits.maxLocales),
    'resources.list': z.strictObject({ ...readShape(limits), ...listShape(limits) }),
    'resources.references': z.strictObject({
      ...target,
      page: listShape(limits).page,
      pageSize: listShape(limits).pageSize,
    }),
    'folders.list': z.strictObject(scope),
    'folders.create': z.strictObject({
      ...scope,
      name: z.string().trim().min(1).max(128),
      parentId: id.nullable().default(null),
    }),
    'folders.update': z
      .strictObject({
        ...target,
        version: revision,
        name: z.string().trim().min(1).max(128).optional(),
        parentId: id.nullable().optional(),
      })
      .refine((value) => value.name !== undefined || value.parentId !== undefined),
    'folders.delete': z.strictObject({ ...target, version: revision }),
  };
}
