import { z } from 'zod';
import { groupBySchema } from './document-groups';
import { editorNodeSchema, editorPreviewSchema } from './editor';
export const presetAccessRuleSchema = z.strictObject({
  constraint: z.string(),
  users: z.array(z.uuid()).optional(),
  data: z.record(z.string(), z.json()).optional(),
  initialSnapshot: z.string().optional(),
});
export const presetAccessSchema = z.strictObject({
  read: presetAccessRuleSchema,
  update: presetAccessRuleSchema,
  delete: presetAccessRuleSchema,
});
export type PresetAccess = z.infer<typeof presetAccessSchema>;
export const presetEditorSchema = editorPreviewSchema.extend({
  layout: z.array(editorNodeSchema),
  data: z.record(z.string(), z.json()),
  initialSnapshot: z.string().nullable(),
  constraints: z.array(z.strictObject({ value: z.string(), label: z.string() })),
  componentVersions: z.record(z.string(), z.string()),
  richTextNodes: z.array(z.strictObject({ type: z.string(), version: z.string() })),
});
export type PresetEditor = z.infer<typeof presetEditorSchema>;

export const queryPresetSchema = z.strictObject({
  id: z.uuid(),
  collection: z.string(),
  ownerId: z.uuid(),
  name: z.string(),
  shared: z.boolean(),
  access: presetAccessSchema,
  permissions: z.strictObject({ read: z.boolean(), update: z.boolean(), delete: z.boolean() }),
  query: z.strictObject({
    where: z.json().optional(),
    sort: z.array(z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) })),
    columns: z.array(z.string()),
    q: z.string(),
    groupBy: groupBySchema.optional(),
  }),
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
export type QueryPreset = z.infer<typeof queryPresetSchema>;
