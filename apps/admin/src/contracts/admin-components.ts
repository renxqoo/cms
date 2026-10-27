import { z } from 'zod';

export const adminComponentReferenceSchema = z.union([
  z.literal(false),
  z.string(),
  z.strictObject({ id: z.string(), props: z.record(z.string(), z.json()).optional() }),
]);
export const adminComponentListSchema = z.union([
  z.literal(false),
  z.array(adminComponentReferenceSchema),
]);
export type AdminComponentReference = z.infer<typeof adminComponentReferenceSchema>;
export const adminFieldComponentsSchema = z.strictObject({
  Field: adminComponentReferenceSchema.optional(),
  Label: adminComponentReferenceSchema.optional(),
  Description: adminComponentReferenceSchema.optional(),
  Error: adminComponentReferenceSchema.optional(),
  Cell: adminComponentReferenceSchema.optional(),
  Filter: adminComponentReferenceSchema.optional(),
  Diff: adminComponentReferenceSchema.optional(),
  RowLabel: adminComponentReferenceSchema.optional(),
  Block: adminComponentReferenceSchema.optional(),
  beforeInput: adminComponentListSchema.optional(),
  afterInput: adminComponentListSchema.optional(),
});
export const adminCollectionComponentsSchema = z.strictObject({
  Header: adminComponentReferenceSchema.optional(),
  List: adminComponentReferenceSchema.optional(),
  Edit: adminComponentReferenceSchema.optional(),
  Description: adminComponentReferenceSchema.optional(),
  beforeList: adminComponentListSchema.optional(),
  afterList: adminComponentListSchema.optional(),
  beforeEdit: adminComponentListSchema.optional(),
  afterEdit: adminComponentListSchema.optional(),
  beforeListTable: adminComponentListSchema.optional(),
  afterListTable: adminComponentListSchema.optional(),
  listMenuItems: adminComponentListSchema.optional(),
  ListActions: adminComponentListSchema.optional(),
  NoResults: adminComponentReferenceSchema.optional(),
  beforeDocumentControls: adminComponentListSchema.optional(),
  BeforeDocumentMeta: adminComponentListSchema.optional(),
  editMenuItems: adminComponentListSchema.optional(),
  PreviewButton: adminComponentReferenceSchema.optional(),
  PublishButton: adminComponentReferenceSchema.optional(),
  SaveButton: adminComponentReferenceSchema.optional(),
  SaveDraftButton: adminComponentReferenceSchema.optional(),
  Status: adminComponentReferenceSchema.optional(),
  UnpublishButton: adminComponentReferenceSchema.optional(),
  Upload: adminComponentReferenceSchema.optional(),
  View: adminComponentReferenceSchema.optional(),
  ViewActions: adminComponentListSchema.optional(),
  Icon: adminComponentReferenceSchema.optional(),
  SmallIcon: adminComponentReferenceSchema.optional(),
});
export const adminViewSchema = z.object({
  id: z.string(),
  scope: z.enum(['collection', 'document']),
  path: z.string(),
  label: z.string(),
  component: adminComponentReferenceSchema,
  actions: adminComponentListSchema.optional(),
  tab: z.boolean().optional(),
  meta: z.record(z.string(), z.json()).optional(),
});
export type AdminView = z.infer<typeof adminViewSchema>;
