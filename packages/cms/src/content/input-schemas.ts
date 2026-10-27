import { copyLocaleInputSchema } from './documents/copy-locale-input.ts';
import { z } from 'zod';
import { validationInputSchema } from './documents/validation-input.ts';
import { editorPreviewInputSchema } from './editor/preview-input.ts';
import { editorInputSchema } from './editor/input.ts';
import { fieldOptionsInputSchema } from './editor/field-options-input.ts';
import { hierarchyInputSchemas } from './hierarchy/input.ts';
import { queryPresetInputSchemas } from './queries/preset-contracts.ts';
import { collaborationInputSchemas } from './collaboration/input.ts';
import { documentOrderInputSchemas } from './documents/order-contracts.ts';
import { joinInputSchemas } from './joins/input.ts';
import {
  documentReadShape,
  documentListShape,
  contentLocaleSchema,
} from './queries/input-shapes.ts';
import type { QueryInputLimits } from './queries/input-shapes.ts';
import { groupingInputSchemas } from './queries/grouping-contracts.ts';

export interface ContentInputLimits extends QueryInputLimits {
  maxArrayItems: number;
  maxBatchItems: number;
  maxSyncBatchItems: number;
}

const id = z.uuid().transform((value) => value.toLowerCase());
const revision = z.number().int().min(1).max(2_147_483_647);
const collection = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const locale = contentLocaleSchema;
const data = z.record(z.string(), z.unknown());
const scope = { collection };
const target = { ...scope, id };
const mutation = { ...target, revision };
const localized = { locale: locale.optional() };
const file = { uploadId: id.optional() };
const folder = { folderId: id.nullable().optional() };

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

function previewTicketSchemas() {
  return {
    'documents.createPreviewTicket': z.strictObject({
      collection: z.literal('models'),
      id,
      ...localized,
      expectedRevision: revision,
    }),
    'documents.revokePreviewTicket': z.strictObject({
      collection: z.literal('models'),
      id,
      ticketId: id,
    }),
  };
}

function documentSchemas(limits: ContentInputLimits) {
  return {
    'languages.setDefault': z.strictObject({
      ...mutation,
      collection: z.literal('languages'),
      expectedDefaultCode: z.string().min(1).max(32),
    }),
    'documents.list': z.strictObject({
      ...scope,
      ...documentReadShape(limits),
      ...documentListShape(limits),
    }),
    'documents.create': createSchema(limits),
    'documents.validate': validationInputSchema(limits.maxLocales),
    'documents.get': z.strictObject({ ...target, ...documentReadShape(limits) }),
    ...previewTicketSchemas(),
    'documents.update': updateSchema(limits),
    'documents.archive': z.strictObject(mutation),
    'documents.copyLocale': copyLocaleInputSchema,
    'documents.renameFile': z.strictObject({
      ...mutation,
      locale: z
        .string()
        .regex(/^(?!all$)[a-zA-Z][a-zA-Z0-9_-]{0,31}$/)
        .optional(),
      filename: z.string().min(1).max(255),
    }),
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
  const read = documentReadShape(limits);
  return {
    'versions.list': z.strictObject({
      ...target,
      ...localized,
      page: documentListShape(limits).page,
      pageSize: documentListShape(limits).pageSize,
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
      action: z.enum(['publish', 'unpublish']).optional(),
      executeAt: z.iso.datetime(),
    }),
    'content.cancelPublicationSchedule': z.strictObject({
      ...target,
      ...localized,
      scheduleId: id,
    }),
    'content.getJob': z.strictObject({ ...scope, ...localized, jobId: id }),
    'content.listJobs': z.strictObject({
      ...scope,
      ...localized,
      page: documentListShape(limits).page,
      pageSize: documentListShape(limits).pageSize,
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
    ...hierarchyInputSchemas(limits),
    ...documentSchemas(limits),
    ...collaborationInputSchemas,
    ...versionSchemas(limits),
    ...taskSchemas(limits),
    ...queryPresetInputSchemas(limits),
    ...documentOrderInputSchemas(limits.maxBatchItems),
    ...joinInputSchemas(limits),
    ...groupingInputSchemas(limits),
    'collections.list': z.strictObject({ locale: locale.optional() }),
    'collections.get': z.strictObject({ ...scope, locale: locale.optional() }),
    'collections.editor': editorInputSchema(limits.maxLocales),
    'collections.fieldOptions': fieldOptionsInputSchema(limits),
    'collections.previewEditor': editorPreviewInputSchema(limits.maxSyncBatchItems),
    'resources.list': z.strictObject({
      ...documentReadShape(limits),
      ...documentListShape(limits),
    }),
    'resources.references': z.strictObject({
      ...target,
      page: documentListShape(limits).page,
      pageSize: documentListShape(limits).pageSize,
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
