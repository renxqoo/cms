import { resolveAdminMetadata } from '../collections/admin-metadata.ts';
import { adminAreas } from '../collections/admin-areas.ts';
import { resolveLabel } from '../collections/labels.ts';
import { safeDefaultSort } from '../queries/default-sort.ts';
import { groupableField } from '../queries/grouping-fields.ts';
import { collectionComponentBindings } from '../editor/component-bindings.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { registeredComponentVersions } from '../collections/admin-components.ts';
import { dataFields, namedFields, children, fieldPaths, structural } from './structure.ts';
import { isJsonValue } from './json-value.ts';
import { generateCollectionSchema } from './data-schema.ts';
import { evaluateFieldPolicy } from './policy-context.ts';
import type { PolicyScope, PolicyTraversal } from './policy-context.ts';
import type { CollectionDefinition, FieldDefinition, FieldPolicyContext } from '../definition.ts';
import type { AdminComponentRegistration } from '../collections/admin-types.ts';

async function canQuery(
  field: FieldDefinition,
  input: PolicyTraversal,
  linkedVirtual = false,
): Promise<boolean> {
  if (
    ['join', 'ui'].includes(field.type) ||
    (field.virtual && !(linkedVirtual && typeof field.virtual === 'string'))
  )
    return false;
  if (field.access?.query) return evaluateFieldPolicy(field.access.query, input);
  return !field.access?.read;
}
export async function queryableFields(
  input: PolicyScope & {
    collection: CollectionDefinition;
    context: FieldPolicyContext;
    linkedVirtual?: boolean;
  },
): Promise<string[]> {
  const allowed = new Map<string, boolean>();
  async function visit(
    fields: readonly FieldDefinition[],
    prefix: string,
    parentAllowed: boolean,
  ): Promise<void> {
    for (const field of dataFields(fields)) {
      const path = prefix ? `${prefix}.${field.name}` : String(field.name);
      const canQueryPath =
        parentAllowed && (await canQuery(field, { ...input, path }, input.linkedVirtual));
      allowed.set(path, (allowed.get(path) ?? true) && canQueryPath);
      await visit(children(field), path, canQueryPath);
    }
  }
  await visit(input.collection.fields, '', true);
  return [...allowed].flatMap(([path, permitted]) => (permitted ? [path] : []));
}
async function safeMetadataFields(
  fields: readonly FieldDefinition[],
  input: PolicyTraversal,
): Promise<FieldDefinition[]> {
  const result: FieldDefinition[] = [];
  for (const field of namedFields(fields)) {
    const path = input.path ? `${input.path}.${field.name}` : String(field.name);
    const child = { ...input, path };
    if (
      field.access?.read &&
      (!field.access.query ||
        !(await evaluateFieldPolicy(field.access.query, child)) ||
        !(await evaluateFieldPolicy(field.access.read, child)))
    )
      continue;
    result.push({
      ...field,
      ...(field.fields ? { fields: await safeMetadataFields(field.fields, child) } : {}),
      ...(field.blocks
        ? {
            blocks: await Promise.all(
              field.blocks.map(async (block) => ({
                ...block,
                fields: await safeMetadataFields(block.fields, child),
              })),
            ),
          }
        : {}),
    });
  }
  return result;
}

export async function readableQueryFields(
  input: PolicyScope & { collection: CollectionDefinition; context: FieldPolicyContext },
): Promise<string[]> {
  return fieldPaths(await safeMetadataFields(input.collection.fields, { ...input, path: '' })).map(
    ({ path }) => path,
  );
}
function collectionAdmin(
  collection: CollectionDefinition,
  visible: ReadonlySet<string>,
  locale: string,
) {
  return {
    ...collectionBrowseAdmin(collection, visible, locale),
    ...adminFlags(collection),
    ...(collection.admin?.meta
      ? {
          meta: resolveAdminMetadata(collection.admin.meta, {
            locale,
            fallbackLocale: collection.locales.default,
          }),
        }
      : {}),
    ...(collection.admin?.components ? { components: collection.admin.components } : {}),
    ...(collection.admin?.views
      ? {
          views: collection.admin.views.map((view) => ({
            ...view,
            label: resolveLabel(view.label, locale, view.id),
            ...(view.meta
              ? {
                  meta: resolveAdminMetadata(view.meta, {
                    locale,
                    fallbackLocale: collection.locales.default,
                  }),
                }
              : {}),
          })),
        }
      : {}),
    ...(collection.admin?.description !== undefined
      ? {
          description: resolveLabel(
            collection.admin.description,
            locale,
            resolveLabel(collection.admin.description, collection.locales.default, ''),
          ),
        }
      : {}),
    ...(collection.admin?.useAsTitle && visible.has(collection.admin.useAsTitle)
      ? { useAsTitle: collection.admin.useAsTitle }
      : {}),
    ...(collection.admin?.defaultColumns
      ? { defaultColumns: collection.admin.defaultColumns.filter((path) => visible.has(path)) }
      : {}),
  };
}

function collectionBrowseAdmin(
  collection: CollectionDefinition,
  visible: ReadonlySet<string>,
  locale: string,
) {
  return {
    ...(collection.admin?.group !== undefined
      ? {
          group:
            collection.admin.group === false
              ? false
              : resolveLabel(collection.admin.group, locale, collection.key),
        }
      : {}),
    ...(collection.admin?.pagination ? { pagination: collection.admin.pagination } : {}),
    ...thumbnailMetadata(collection, visible),
  };
}

function thumbnailMetadata(collection: CollectionDefinition, visible: ReadonlySet<string>) {
  const configured = collection.admin?.useAsThumbnail;
  const path =
    configured ??
    fieldPaths(collection.fields).find((entry) => entry.field.type === 'upload' && !entry.repeated)
      ?.path;
  return path && visible.has(path) ? { useAsThumbnail: path } : {};
}

export async function collectionMetadata(
  input: PolicyScope & {
    collection: CollectionDefinition;
    context: FieldPolicyContext;
    adminComponents?: readonly AdminComponentRegistration[];
  },
) {
  const fields = await safeMetadataFields(input.collection.fields, { ...input, path: '' });
  const visible = fieldPaths(fields, '', { includeUi: true });
  const queryable = new Set(await queryableFields(input));
  const groupable = visible.some(({ field }) => typeof field.virtual === 'string')
    ? new Set(await queryableFields({ ...input, linkedVirtual: true }))
    : queryable;
  const sortable = sortableMetadata(visible, queryable);
  if (input.collection.orderable) sortable.add('_order');
  const readable = new Set(visible.map((entry) => entry.path));
  const defaultSort = safeDefaultSort(
    input.collection,
    [...queryable].filter((path) => readable.has(path)),
  );
  const dataSchema = generateCollectionSchema({ ...input.collection, fields }, 'read');
  if (!isJsonValue(dataSchema)) fail('invalid_input');
  return {
    ...metadataIdentity(input.collection, input.context.locale),
    defaultSort,
    admin: collectionAdmin(
      input.collection,
      new Set(visible.map((entry) => entry.path)),
      input.context.locale,
    ),
    dataSchema,
    componentVersions: registeredComponentVersions(input.adminComponents ?? [], [
      ...collectionComponentBindings(input.collection).map((binding) => ({
        [binding.slot]: binding.reference,
      })),
      ...visible.map(({ field }) => metadataComponents(field)),
    ]),
    fields: metadataFields(visible, {
      queryable,
      sortable,
      groupable,
      locale: input.context.locale,
    }),
  };
}

function metadataFields(
  visible: ReturnType<typeof fieldPaths>,
  input: {
    queryable: ReadonlySet<string>;
    sortable: ReadonlySet<string>;
    groupable: ReadonlySet<string>;
    locale: string;
  },
) {
  return visible.map(({ path, field }) => ({
    id: field.id,
    path,
    type: field.type,
    label: resolveLabel(field.label, input.locale, field.name ?? ''),
    required: field.required === true,
    localized: field.localized === true,
    disabled: adminAreas(field),
    queryable: input.queryable.has(path),
    sortable: input.sortable.has(path),
    groupable: input.groupable.has(path) && groupableField(field),
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.admin?.components ? { components: metadataComponents(field) } : {}),
  }));
}

function sortableMetadata(fields: ReturnType<typeof fieldPaths>, queryable: ReadonlySet<string>) {
  const denied = new Set(
    fields
      .filter(({ repeated, field }) => repeated || structural(field) || field.type === 'join')
      .map(({ path }) => path),
  );
  return new Set(
    fields.filter(({ path }) => !denied.has(path) && queryable.has(path)).map(({ path }) => path),
  );
}

function metadataComponents(field: FieldDefinition) {
  const configured = field.admin?.components;
  return {
    ...(configured?.Cell !== undefined ? { Cell: configured.Cell } : {}),
    ...(configured?.Filter !== undefined ? { Filter: configured.Filter } : {}),
    ...(configured?.Diff !== undefined ? { Diff: configured.Diff } : {}),
  };
}

function metadataIdentity(collection: CollectionDefinition, locale: string) {
  return {
    key: collection.key,
    enableQueryPresets: collection.enableQueryPresets !== false,
    label: resolveLabel(collection.labels?.plural, locale, collection.label),
    labels: {
      singular: resolveLabel(collection.labels?.singular, locale, collection.label),
      plural: resolveLabel(collection.labels?.plural, locale, collection.label),
    },
    schemaVersion: collection.schemaVersion,
    mode: collection.mode,
    history: collection.history !== false,
    singleton: collection.singleton === true,
    defaultLocale: collection.locales.default,
    orderable: collection.orderable === true,
    locales: [...collection.locales.supported],
  };
}

function adminFlags(collection: CollectionDefinition) {
  return {
    disableCopyToLocale: collection.admin?.disableCopyToLocale === true,
    enableRichTextLink: collection.admin?.enableRichTextLink !== false,
    enableRichTextRelationship: collection.admin?.enableRichTextRelationship !== false,
  };
}
