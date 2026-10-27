import { presetConstraintsSchema } from './preset-config-schema.ts';
import { fieldAdminSchema } from './field-admin-schema.ts';
import { adminMetadataSchema } from './admin-metadata.ts';
import { localizedLabelSchema, localizedTextSchema } from './labels.ts';
import { adminComponentReferenceSchema, adminViewSchema } from './admin-component-reference.ts';
import { fieldOptionSchema } from '../fields/options.ts';
import { hierarchyConfigSchema } from './hierarchy-config.ts';
import { z } from 'zod';
import { whereSchema } from '../queries/where-schema.ts';
import { collectionComponentsSchema } from './admin-components.ts';

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
const asyncPolicy = z.strictObject({
  version: z.string().min(1).max(128),
  run: z.custom<(...args: never[]) => unknown>(
    (value) =>
      typeof value === 'function' &&
      ['[object Function]', '[object AsyncFunction]'].includes(
        Object.prototype.toString.call(value),
      ),
  ),
});
const hookList = z.array(asyncPolicy);
const fieldHooks = z.strictObject({
  beforeValidate: hookList.optional(),
  beforeChange: hookList.optional(),
  afterRead: hookList.optional(),
  afterChange: hookList.optional(),
});
const collectionHooks = z.strictObject({
  beforeOperation: hookList.optional(),
  afterOperation: hookList.optional(),
  beforeValidate: hookList.optional(),
  beforeChange: hookList.optional(),
  afterChange: hookList.optional(),
  beforePublish: hookList.optional(),
  beforeRead: hookList.optional(),
  afterRead: hookList.optional(),
  beforeDelete: hookList.optional(),
  afterDelete: hookList.optional(),
  afterError: hookList.optional(),
});
export const fieldSchema: z.ZodType = z.lazy(() => fieldObject);
const fieldObject = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  name: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
    .optional(),
  type: z.enum([
    'text',
    'slug',
    'textarea',
    'number',
    'boolean',
    'date',
    'email',
    'select',
    'radio',
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
    'ui',
  ]),
  label: localizedLabelSchema.optional(),
  disableDuplicate: z.boolean().optional(),
  admin: fieldAdminSchema(asyncPolicy).optional(),
  timezone: z
    .union([
      z.boolean(),
      z.strictObject({
        defaultTimezone: z.string().min(1).optional(),
        supportedTimezones: z.array(fieldOptionSchema).min(1).optional(),
        required: z.boolean().optional(),
        override: policy.optional(),
      }),
    ])
    .optional(),
  timezoneFor: z.string().min(1).optional(),
  useAsSlug: z.string().min(1).optional(),
  slugify: asyncPolicy.optional(),
  required: z.boolean().optional(),
  localized: z.boolean().optional(),
  unique: z.boolean().optional(),
  index: z.boolean().optional(),
  defaultValue: z.union([asyncPolicy, jsonValue]).optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  precision: z.number().int().min(0).max(15).optional(),
  options: z.array(fieldOptionSchema).min(1).optional(),
  hasMany: z.boolean().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  filterOptions: z
    .union([whereSchema, asyncPolicy, z.boolean(), z.array(z.string().min(1))])
    .optional(),
  minRows: z.number().int().nonnegative().optional(),
  maxRows: z.number().int().nonnegative().optional(),
  fields: z.array(fieldSchema).optional(),
  blocks: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
        admin: z
          .strictObject({
            components: z
              .strictObject({
                Block: adminComponentReferenceSchema.optional(),
                Label: adminComponentReferenceSchema.optional(),
              })
              .optional(),
          })
          .optional(),
        label: localizedLabelSchema,
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
        label: localizedLabelSchema,
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
  join: z
    .strictObject({
      collection: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      field: z.string().min(1),
      where: whereSchema.optional(),
      defaultPageSize: z.number().int().positive().optional(),
      defaultSort: z
        .array(z.strictObject({ field: z.string().min(1), order: z.enum(['asc', 'desc']) }))
        .optional(),
      orderable: z.boolean().optional(),
    })
    .optional(),
  access: z
    .strictObject({
      read: asyncPolicy.optional(),
      write: asyncPolicy.optional(),
      query: asyncPolicy.optional(),
      validate: asyncPolicy.optional(),
    })
    .optional(),
  validate: asyncPolicy.optional(),
  hooks: fieldHooks.optional(),
  virtual: z
    .union([
      z.literal(true),
      z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/)
        .max(512),
      asyncPolicy,
    ])
    .optional(),
});
const functionValue = z.custom<(...args: never[]) => unknown>(
  (value) =>
    typeof value === 'function' && Object.prototype.toString.call(value) === '[object Function]',
);
export const collectionSchema: z.ZodType = z.lazy(() => collectionObject);
const collectionObject = z
  .strictObject({
    enableQueryPresets: z.boolean().optional(),
    filterQueryPresetConstraints: asyncPolicy.optional(),
    queryPresetConstraints: presetConstraintsSchema(fieldSchema, asyncPolicy).optional(),
    id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    key: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    schemaVersion: z
      .number()
      .int()
      .positive()
      .max(2 ** 31 - 1),
    label: z.string().min(1).max(128),
    labels: z
      .strictObject({
        singular: localizedLabelSchema.optional(),
        plural: localizedLabelSchema.optional(),
      })
      .optional(),
    fields: z.array(fieldSchema),
    mode: z.enum(['direct', 'drafts']),
    drafts: z
      .strictObject({
        validate: z.boolean().optional(),
        autosave: z
          .union([
            z.boolean(),
            z.strictObject({ intervalMs: z.number().int().positive().max(2147483647).optional() }),
          ])
          .optional(),
        schedule: z.boolean().optional(),
      })
      .optional(),
    localizeStatus: z.boolean().optional(),
    defaultPopulate: z.array(z.string().min(1)).optional(),
    localeSource: z.string().min(1).max(128).optional(),
    publicationLocalesField: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
      .optional(),
    history: z.union([
      z.literal(false),
      z.strictObject({
        maxVersions: z.number().int().nonnegative(),
        retentionMs: z.number().int().nonnegative(),
      }),
    ]),
    singleton: z.boolean().optional(),
    disableBulkEdit: z.boolean().optional(),
    disableBulkDelete: z.boolean().optional(),
    disableDuplicate: z.boolean().optional(),
    authorship: z
      .union([
        z.boolean(),
        z.strictObject({ createdBy: z.boolean().optional(), updatedBy: z.boolean().optional() }),
      ])
      .optional(),
    hierarchy: hierarchyConfigSchema.optional(),
    tags: hierarchyConfigSchema.optional(),
    orderable: z.boolean().optional(),
    lockDocuments: z
      .union([
        z.literal(false),
        z
          .strictObject({
            durationMs: z.number().int().positive().max(2_147_483_647),
            heartbeatMs: z.number().int().positive().max(2_147_483_647),
          })
          .refine((value) => value.heartbeatMs * 2 < value.durationMs),
      ])
      .optional(),
    preview: z
      .strictObject({
        url: policy,
        origins: z
          .array(
            z.url().refine((value) => {
              const url = new URL(value);
              return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
            }),
          )
          .min(1),
        devices: z
          .array(
            z.strictObject({
              name: z.string().min(1).max(64),
              width: z.number().int().positive().max(16384),
              height: z.number().int().positive().max(16384),
            }),
          )
          .min(1),
      })
      .optional(),
    livePreview: z.boolean().optional(),
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
    access: z.record(z.string(), asyncPolicy).optional(),
    hooks: collectionHooks.optional(),
    admin: z
      .strictObject({
        baseFilter: asyncPolicy.optional(),
        listSearchableFields: z.array(z.string().min(1).max(512)).optional(),
        useAsTitle: z.string().min(1).max(512).optional(),
        useAsThumbnail: z.string().min(1).max(512).optional(),
        group: z.union([z.literal(false), localizedLabelSchema]).optional(),
        hidden: z.union([z.boolean(), asyncPolicy]).optional(),
        pagination: z
          .strictObject({
            defaultLimit: z.number().int().positive().optional(),
            limits: z.array(z.number().int().positive()).min(1).optional(),
          })
          .optional(),
        defaultColumns: z.array(z.string().min(1).max(512)).optional(),
        description: localizedTextSchema(2000).optional(),
        meta: adminMetadataSchema.optional(),
        disableCopyToLocale: z.boolean().optional(),
        enableRichTextLink: z.boolean().optional(),
        enableRichTextRelationship: z.boolean().optional(),
        formatDocURL: asyncPolicy.optional(),
        components: collectionComponentsSchema.optional(),
        views: z.array(adminViewSchema).optional(),
      })
      .optional(),
    upload: z
      .strictObject({
        filesRequiredOnCreate: z.boolean().optional(),
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
          afterCommit: z.string().min(1),
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
  })
  .refine((value) => value.livePreview !== true || value.preview !== undefined);
