import { adminMetadataSchema } from './admin-metadata.ts';
import { localizedLabelSchema } from './labels.ts';
import { z } from 'zod';
import type { AdminComponentReference } from './admin-types.ts';

export const componentIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/)
  .max(128);
export const adminComponentReferenceSchema = z.union([
  z.literal(false),
  componentIdSchema,
  z.strictObject({ id: componentIdSchema, props: z.record(z.string(), z.json()).optional() }),
]);
export const adminComponentListSchema = z.union([
  z.literal(false),
  z.array(adminComponentReferenceSchema),
]);
export function componentId(reference: AdminComponentReference): string | undefined {
  if (reference === false) return undefined;
  return typeof reference === 'string' ? reference : reference.id;
}
export function componentReferences(value: unknown): AdminComponentReference[] {
  if (value === undefined || value === false) return [];
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  return values.map((entry) => {
    const reference = adminComponentReferenceSchema.parse(entry);
    return typeof reference === 'object'
      ? { id: reference.id, ...(reference.props ? { props: reference.props } : {}) }
      : reference;
  });
}
export const adminViewSchema = z.strictObject({
  id: componentIdSchema,
  scope: z.enum(['collection', 'document']),
  path: z
    .string()
    .regex(/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/)
    .max(256),
  label: localizedLabelSchema,
  component: adminComponentReferenceSchema,
  actions: adminComponentListSchema.optional(),
  tab: z.boolean().optional(),
  meta: adminMetadataSchema.optional(),
});
