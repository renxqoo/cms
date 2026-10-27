import { adminComponentReferenceSchema } from './admin-component-reference.ts';
import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { fieldPaths } from '../fields/structure.ts';
import type { CollectionDefinition, FieldDefinition, HierarchyConfig } from '../definition.ts';

const fieldName = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
export const hierarchyConfigSchema = z.union([
  z.boolean(),
  z.strictObject({
    kind: z.enum(['hierarchy', 'tags']).optional(),
    parentFieldName: fieldName.optional(),
    slugField: fieldName.optional(),
    slugify: z
      .strictObject({
        version: z.string().min(1).max(128),
        run: z.custom<(value: string) => string>(
          (value) =>
            typeof value === 'function' &&
            Object.prototype.toString.call(value) === '[object Function]',
        ),
      })
      .optional(),
    slugPathFieldName: fieldName.optional(),
    titlePathFieldName: fieldName.optional(),
    allowHasMany: z.boolean().optional(),
    collectionSpecific: z.union([z.boolean(), z.strictObject({ fieldName })]).optional(),
    joinField: z.strictObject({ name: fieldName }).optional(),
    admin: z
      .strictObject({
        treeLimit: z.number().int().positive().optional(),
        useHeaderButton: z.boolean().optional(),
        injectSidebarTab: z.boolean().optional(),
        components: z
          .strictObject({
            Icon: adminComponentReferenceSchema.optional(),
            SmallIcon: adminComponentReferenceSchema.optional(),
          })
          .optional(),
      })
      .optional(),
  }),
]);

export function hierarchySettings(collection: CollectionDefinition) {
  const value = collection.hierarchy;
  if (!value) return null;
  const options: HierarchyConfig = value === true ? {} : value;
  return {
    ...options,
    kind: options.kind ?? 'hierarchy',
    parentFieldName: options.parentFieldName ?? 'parent',
    slugPathFieldName: options.slugPathFieldName ?? 'slugPath',
    titlePathFieldName: options.titlePathFieldName ?? 'titlePath',
    allowHasMany: options.allowHasMany ?? true,
    admin: {
      treeLimit: options.admin?.treeLimit,
      components: options.admin?.components,
      useHeaderButton: options.admin?.useHeaderButton ?? true,
      injectSidebarTab: options.admin?.injectSidebarTab ?? true,
    },
    collectionSpecific: collectionScope(options.collectionSpecific),
  };
}

function addField(fields: FieldDefinition[], field: FieldDefinition) {
  const existing = fields.find((value) => value.name === field.name);
  if (!existing) fields.push(field);
  return existing;
}

function hierarchyFields(collection: CollectionDefinition) {
  const options = hierarchySettings(collection);
  if (!options) return collection.fields;
  const fields = [...collection.fields];
  addField(fields, {
    id: 'hierarchy_parent',
    name: options.parentFieldName,
    label: 'Parent',
    type: 'relationship',
    relationTo: [collection.key],
    index: true,
    onDelete: 'restrict',
  });
  for (const [id, name] of [
    ['hierarchy_slug_path', options.slugPathFieldName],
    ['hierarchy_title_path', options.titlePathFieldName],
  ] as const)
    addField(fields, { id, name, type: 'text', virtual: true });
  if (options.joinField)
    addField(fields, {
      id: 'hierarchy_children',
      name: options.joinField.name,
      type: 'join',
      join: { collection: collection.key, field: options.parentFieldName },
    });
  return fields;
}

export function normalizeHierarchy(collection: CollectionDefinition): CollectionDefinition {
  if (collection.hierarchy && collection.tags) fail('invalid_input');
  if (!collection.hierarchy && !collection.tags) return collection;
  const { tags, ...rest } = collection;
  const enabled = tags === undefined || tags === false ? collection.hierarchy : tags;
  const options = typeof enabled === 'object' ? enabled : {};
  const normalized = {
    ...rest,
    hierarchy: {
      ...options,
      kind: tags ? ('tags' as const) : (options.kind ?? ('hierarchy' as const)),
    },
  };
  return {
    ...normalized,
    fields: hierarchyFields(normalized),
    ...(collection.previousSchemas
      ? { previousSchemas: collection.previousSchemas.map(normalizeHierarchy) }
      : {}),
  };
}

export function prepareHierarchyCollections(collections: readonly CollectionDefinition[]) {
  return collections.map((collection) => {
    const normalized = normalizeHierarchy(collection);
    const options = hierarchySettings(normalized);
    if (!options?.collectionSpecific) return normalized;
    const sources = collections
      .filter(
        (source) =>
          source.key !== normalized.key &&
          fieldPaths(source.fields).some(({ field }) => field.relationTo?.includes(normalized.key)),
      )
      .map((source) => source.key);
    if (sources.length === 0) fail('invalid_input');
    const fields = [...normalized.fields];
    const field = addField(fields, {
      id: 'hierarchy_types',
      name: options.collectionSpecific.fieldName,
      label: 'Allowed collections',
      type: 'select',
      hasMany: true,
      options: sources,
    });
    if (
      field &&
      (field.type !== 'select' ||
        field.hasMany !== true ||
        field.localized ||
        JSON.stringify(field.options?.toSorted()) !== JSON.stringify(sources.toSorted()))
    )
      fail('invalid_input');
    return { ...normalized, fields };
  });
}

function collectionScope(value: HierarchyConfig['collectionSpecific']) {
  if (value === true) return { fieldName: 'hierarchyType' };
  return typeof value === 'object' ? value : (false as const);
}
