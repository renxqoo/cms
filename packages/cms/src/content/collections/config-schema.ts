import { z } from 'zod';

const policy = z.strictObject({
  version: z.string().min(1).max(128),
  run: z.custom<(...args: never[]) => unknown>(
    (value) =>
      typeof value === 'function' && Object.prototype.toString.call(value) === '[object Function]',
  ),
});
const jsonValue: z.ZodType = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);
export const fieldSchema: z.ZodType = z.lazy(() => fieldObject);
const fieldObject = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  name: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
    .optional(),
  type: z.enum([
    'text',
    'textarea',
    'number',
    'boolean',
    'date',
    'email',
    'select',
    'code',
    'json',
    'point',
    'group',
    'array',
    'blocks',
    'tabs',
    'row',
    'collapsible',
    'richText',
    'relationship',
    'upload',
    'join',
  ]),
  label: z.string().min(1).max(128).optional(),
  required: z.boolean().optional(),
  localized: z.boolean().optional(),
  unique: z.boolean().optional(),
  index: z.boolean().optional(),
  defaultValue: jsonValue.optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  precision: z.number().int().min(0).max(15).optional(),
  options: z.array(z.string().min(1).max(128)).min(1).optional(),
  hasMany: z.boolean().optional(),
  fields: z.array(fieldSchema).optional(),
  blocks: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        label: z.string().min(1).max(128),
        fields: z.array(fieldSchema),
      }),
    )
    .min(1)
    .optional(),
  tabs: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        name: z
          .string()
          .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
          .optional(),
        label: z.string().min(1).max(128),
        fields: z.array(fieldSchema),
      }),
    )
    .min(1)
    .optional(),
  relationTo: z
    .array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/))
    .min(1)
    .optional(),
  onDelete: z.enum(['restrict', 'nullify', 'cascade']).optional(),
  join: z.strictObject({ collection: z.string().min(1), field: z.string().min(1) }).optional(),
  access: z
    .strictObject({ read: policy.optional(), write: policy.optional(), query: policy.optional() })
    .optional(),
  validate: policy.optional(),
});
const functionValue = z.custom<(...args: never[]) => unknown>(
  (value) =>
    typeof value === 'function' && Object.prototype.toString.call(value) === '[object Function]',
);
export const collectionSchema: z.ZodType = z.lazy(() => collectionObject);
const collectionObject = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  schemaVersion: z
    .number()
    .int()
    .positive()
    .max(2 ** 31 - 1),
  label: z.string().min(1).max(128),
  fields: z.array(fieldSchema),
  mode: z.enum(['direct', 'drafts']),
  localizeStatus: z.boolean().optional(),
  localeSource: z.string().min(1).max(128).optional(),
  publicationLocalesField: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
    .optional(),
  history: z.union([
    z.literal(false),
    z.strictObject({
      maxVersions: z.number().int().positive(),
      retentionMs: z.number().int().nonnegative(),
    }),
  ]),
  singleton: z.boolean().optional(),
  locales: z.strictObject({
    default: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/),
    supported: z.array(z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/)).min(1),
    fallback: z.record(z.string(), z.array(z.string())),
  }),
  indexes: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        fields: z.array(z.string().min(1)).min(1),
        unique: z.boolean().optional(),
      }),
    )
    .optional(),
  search: z.array(z.string()).optional(),
  defaultSort: z
    .array(z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) }))
    .optional(),
  access: z.record(z.string(), policy).optional(),
  upload: z
    .strictObject({
      mimeTypes: z.array(z.string()).min(1),
      variants: z.array(
        z.strictObject({
          name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          fit: z.enum(['cover', 'contain', 'inside']),
        }),
      ),
    })
    .optional(),
  extensions: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        version: z.string().min(1),
        transform: functionValue.optional(),
        validate: functionValue.optional(),
        afterCommit: z.string().min(1).optional(),
      }),
    )
    .optional(),
  richTextNodes: z
    .array(
      z.strictObject({
        type: z.string(),
        version: z.string(),
        validate: policy,
        references: policy.optional(),
      }),
    )
    .optional(),
  previousSchemas: z.array(collectionSchema).optional(),
  migrations: z
    .array(
      z.strictObject({
        from: z
          .number()
          .int()
          .positive()
          .max(2 ** 31 - 1),
        localeMap: z.record(z.string(), z.string().nullable()).optional(),
        version: z.string().min(1),
        transform: functionValue,
      }),
    )
    .optional(),
});
