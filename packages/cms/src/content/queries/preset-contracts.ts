import { z } from 'zod';
import { presetAccessSchema, presetAccessRuleSchema } from './preset-access-contracts.ts';
import { editorNodeSchema, editorPreviewSchema } from '../editor/contracts.ts';
import { groupBySchema } from './grouping-contracts.ts';

export const queryPresetQuerySchema = z.strictObject({
  where: z.json().optional(),
  sort: z.array(
    z.strictObject({ field: z.string().min(1).max(256), order: z.enum(['asc', 'desc']) }),
  ),
  columns: z.array(z.string().min(1).max(256)),
  q: z.string().max(256),
  groupBy: groupBySchema.optional(),
});

export const queryPresetSchema = z.strictObject({
  id: z.uuid(),
  collection: z.string(),
  ownerId: z.uuid(),
  name: z.string(),
  shared: z.boolean(),
  access: presetAccessSchema,
  permissions: z.strictObject({ read: z.boolean(), update: z.boolean(), delete: z.boolean() }),
  query: queryPresetQuerySchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const queryPresetPageSchema = z.strictObject({
  rows: z.array(queryPresetSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const presetEditorSchema = editorPreviewSchema.extend({
  layout: z.array(editorNodeSchema),
  data: z.record(z.string(), z.json()),
  initialSnapshot: z.string().nullable(),
  constraints: z.array(z.strictObject({ value: z.string(), label: z.string() })),
  componentVersions: z.record(z.string(), z.string()),
  richTextNodes: z.array(z.strictObject({ type: z.string(), version: z.string() })),
});

interface PresetInputLimits {
  maxPageSize: number;
  defaultPageSize: number;
  maxQueryNodes: number;
  maxFields: number;
  maxArrayItems: number;
}
export function queryPresetInputSchemas(limits: PresetInputLimits) {
  const { scope, target, version, access, values } = presetInputShapes(limits);
  const candidate = {
    ...scope,
    id: target.id.optional(),
    version: version.optional(),
    name: z.string().max(128).default(''),
    query: values.query,
    access,
    action: z.enum(['read', 'update', 'delete']),
  };
  return {
    'queryPresets.preview': z.strictObject(candidate).refine(identity),
    'queryPresets.fieldOptions': z
      .strictObject({
        ...candidate,
        path: z.string().min(1).max(512),
        relationTo: scope.collection,
        targetId: z.uuid().optional(),
        q: z.string().max(256).optional(),
        page: z.number().int().positive().max(2_147_483_647).default(1),
        pageSize: z
          .number()
          .int()
          .positive()
          .max(limits.maxPageSize)
          .default(limits.defaultPageSize),
      })
      .refine(identity),
    'queryPresets.list': z.strictObject({
      ...scope,
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(limits.maxPageSize).default(limits.defaultPageSize),
    }),
    'queryPresets.create': z.strictObject({
      ...scope,
      ...values,
      access: access.optional(),
    }),
    'queryPresets.update': z.strictObject({ ...target, ...values, version }),
    'queryPresets.share': z.strictObject({ ...target, version, access }),
    'queryPresets.delete': z.strictObject({ ...target, version }),
  };
}

export type QueryPresetQuery = z.infer<typeof queryPresetQuerySchema>;

function identity(value: { id?: string | undefined; version?: number | undefined }) {
  return Boolean(value.id) === (value.version !== undefined);
}

function presetInputShapes(limits: PresetInputLimits) {
  const scope = {
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    locale: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/)
      .optional(),
  };
  const target = { ...scope, id: z.uuid().transform((value) => value.toLowerCase()) };
  const version = z.number().int().positive().max(2_147_483_647);
  const rule = presetAccessRuleSchema.extend({
    users: presetAccessRuleSchema.shape.users.unwrap().max(limits.maxArrayItems).optional(),
  });
  const access = z.strictObject({ read: rule, update: rule, delete: rule });
  const values = {
    name: z.string().trim().min(1).max(128),
    query: queryPresetQuerySchema.extend({
      where: z.unknown().optional(),
      sort: queryPresetQuerySchema.shape.sort.max(limits.maxQueryNodes),
      columns: queryPresetQuerySchema.shape.columns.max(limits.maxFields),
    }),
  };
  return { scope, target, version, access, values };
}
