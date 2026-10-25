import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, ContentLimits, FieldDefinition } from '../definition.ts';
import { dataFields, fieldPaths } from '../fields/structure.ts';

const reserved = new Set([
  'id',
  'blockType',
  'collection',
  'revision',
  'versionId',
  'publishedVersionId',
  'createdAt',
  'updatedAt',
  'trashedAt',
  'folderId',
  '__proto__',
  'constructor',
  'prototype',
]);
function rejectUnless(condition: boolean): void {
  if (!condition) fail('invalid_input');
}
function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}
const optionTypes: Partial<Record<keyof FieldDefinition, readonly string[]>> = {
  fields: ['group', 'array', 'row', 'collapsible'],
  blocks: ['blocks'],
  tabs: ['tabs'],
  options: ['select'],
  relationTo: ['relationship', 'upload'],
  join: ['join'],
  onDelete: ['relationship', 'upload'],
  hasMany: ['select', 'relationship', 'upload'],
  precision: ['number'],
  min: ['number', 'array', 'blocks'],
  max: ['number', 'array', 'blocks'],
  minLength: ['text', 'textarea', 'email', 'code'],
  maxLength: ['text', 'textarea', 'email', 'code'],
};
const requiredProperties: Partial<Record<FieldDefinition['type'], keyof FieldDefinition>> = {
  group: 'fields',
  array: 'fields',
  row: 'fields',
  collapsible: 'fields',
  blocks: 'blocks',
  tabs: 'tabs',
  select: 'options',
  relationship: 'relationTo',
  upload: 'relationTo',
  join: 'join',
};
function validateOptions(field: FieldDefinition): void {
  for (const [key, types] of Object.entries(optionTypes)) {
    if (Object.hasOwn(field, key) && !types.includes(field.type)) fail('invalid_input');
  }
  const required = requiredProperties[field.type];
  if (required && field[required] === undefined) fail('invalid_input');
  if (field.options) rejectUnless(unique(field.options));
  if (field.relationTo) rejectUnless(unique(field.relationTo));
  if (field.blocks) rejectUnless(unique(field.blocks.map((block) => block.key)));
  validateBoundaries(field);
  validateFieldShape(field);
}
function validateBoundaries(field: FieldDefinition): void {
  if (field.min !== undefined && field.max !== undefined) rejectUnless(field.min <= field.max);
  if (field.minLength !== undefined && field.maxLength !== undefined)
    rejectUnless(field.minLength <= field.maxLength);
  if (field.unique)
    rejectUnless(!['group', 'array', 'blocks', 'json', 'richText', 'join'].includes(field.type));
}
function validateFieldShape(field: FieldDefinition): void {
  if (['row', 'collapsible', 'tabs'].includes(field.type)) {
    rejectUnless(
      ![
        field.name,
        field.localized,
        field.required,
        field.unique,
        field.index,
        field.access,
        field.validate,
      ].some(Boolean),
    );
    rejectUnless(field.defaultValue === undefined);
    return;
  }
  rejectUnless(Boolean(field.name) && !reserved.has(String(field.name)));
  if (field.type === 'join') {
    rejectUnless(
      ![field.required, field.localized, field.unique, field.index, field.hasMany].some(Boolean),
    );
    rejectUnless(field.defaultValue === undefined);
  }
}

function validateFields(input: {
  fields: readonly FieldDefinition[];
  limits: ContentLimits;
  seen: Set<string>;
  depth: number;
  count: { value: number };
}): void {
  rejectUnless(input.depth <= input.limits.maxFieldDepth);
  rejectUnless(unique(dataFields(input.fields).map((field) => String(field.name))));
  for (const field of input.fields) {
    input.count.value += 1;
    rejectUnless(input.count.value <= input.limits.maxFields && !input.seen.has(field.id));
    input.seen.add(field.id);
    validateOptions(field);
    for (const block of field.blocks ?? []) {
      rejectUnless(!input.seen.has(block.id));
      input.seen.add(block.id);
      validateFields({ ...input, fields: block.fields, depth: input.depth + 1 });
    }
    for (const tab of field.tabs ?? []) {
      rejectUnless(!input.seen.has(tab.id));
      input.seen.add(tab.id);
      if (tab.name) rejectUnless(!reserved.has(tab.name));
      validateFields({ ...input, fields: tab.fields, depth: input.depth + 1 });
    }
    if (field.fields) validateFields({ ...input, fields: field.fields, depth: input.depth + 1 });
  }
}
function validatePaths(collection: CollectionDefinition): void {
  const paths = new Map(fieldPaths(collection.fields).map((entry) => [entry.path, entry]));
  for (const index of collection.indexes ?? []) {
    rejectUnless(unique(index.fields));
    for (const path of index.fields) {
      const entry = paths.get(path);
      rejectUnless(
        entry !== undefined &&
          !entry.repeated &&
          !['group', 'array', 'blocks', 'join', 'json', 'richText'].includes(entry.field.type),
      );
    }
  }
  rejectUnless(unique((collection.indexes ?? []).map((index) => index.id)));
  for (const path of collection.search ?? [])
    rejectUnless(['text', 'textarea', 'email', 'code'].includes(paths.get(path)?.field.type ?? ''));
  for (const sort of collection.defaultSort ?? []) validateSort(paths.get(sort.field));
}
function validateSort(entry: ReturnType<typeof fieldPaths>[number] | undefined): void {
  rejectUnless(
    entry !== undefined &&
      !entry.repeated &&
      !['group', 'join', 'array', 'blocks'].includes(entry.field.type),
  );
}
export function validateDefinition(
  collection: CollectionDefinition,
  limits: ContentLimits,
  historical = false,
): void {
  rejectUnless(collection.mode !== 'drafts' || collection.history !== false);
  validateCollectionLocales(collection, limits);
  validateFields({
    fields: collection.fields,
    limits,
    seen: new Set(),
    depth: 1,
    count: { value: 0 },
  });
  rejectUnless(
    (collection.indexes?.length ?? 0) <= limits.maxFields &&
      (collection.richTextNodes?.length ?? 0) <= limits.maxFields,
  );
  validatePaths(collection);
  if (!historical) validateMigrations(collection);
  validateSchemaVersions(collection);
}
export function validateRelations(collections: readonly CollectionDefinition[]): void {
  const byKey = new Map(collections.map((collection) => [collection.key, collection]));
  for (const collection of collections) {
    for (const { field } of fieldPaths(collection.fields)) {
      for (const target of field.relationTo ?? []) {
        const definition = byKey.get(target);
        rejectUnless(
          definition !== undefined && (field.type !== 'upload' || definition.upload !== undefined),
        );
      }
      if (field.join) {
        const target = byKey.get(field.join.collection);
        const inverse =
          target &&
          fieldPaths(target.fields).find((item) => item.path === field.join?.field)?.field;
        rejectUnless(
          inverse !== undefined &&
            ['relationship', 'upload'].includes(inverse.type) &&
            (inverse.relationTo ?? []).includes(collection.key),
        );
      }
    }
  }
}

function validateMigrations(collection: CollectionDefinition): void {
  const definitions = new Map(
    [...(collection.previousSchemas ?? []), collection].map((definition) => [
      definition.schemaVersion,
      definition,
    ]),
  );
  for (const migration of collection.migrations ?? []) {
    const previous = definitions.get(migration.from);
    const next = definitions.get(migration.from + 1);
    rejectUnless(previous !== undefined && next !== undefined);
    if (!previous || !next) fail('invalid_input');
    if (migration.localeMap) validateLocaleMap({ previous, next, map: migration.localeMap });
  }
  for (const previous of collection.previousSchemas ?? []) {
    const next = definitions.get(previous.schemaVersion + 1);
    rejectUnless(next !== undefined);
    if (
      next &&
      JSON.stringify(previous.locales.supported) !== JSON.stringify(next.locales.supported)
    )
      rejectUnless(
        collection.migrations?.some(
          (migration) =>
            migration.from === previous.schemaVersion && migration.localeMap !== undefined,
        ) === true,
      );
  }
}

function validateCollectionLocales(collection: CollectionDefinition, limits: ContentLimits): void {
  const { locales } = collection;
  rejectUnless(
    locales.supported.length <= limits.maxLocales &&
      unique(locales.supported) &&
      locales.supported.includes(locales.default),
  );
  for (const [source, targets] of Object.entries(locales.fallback))
    rejectUnless(
      locales.supported.includes(source) &&
        unique(targets) &&
        !targets.includes(source) &&
        targets.every((locale) => locales.supported.includes(locale)),
    );
}
function validateSchemaVersions(collection: CollectionDefinition): void {
  for (const previous of collection.previousSchemas ?? [])
    rejectUnless(
      previous.id === collection.id &&
        previous.schemaVersion < collection.schemaVersion &&
        !previous.previousSchemas?.length,
    );
  rejectUnless(
    unique((collection.previousSchemas ?? []).map((item) => String(item.schemaVersion))),
  );
  rejectUnless(unique((collection.migrations ?? []).map((item) => String(item.from))));
}

function validateLocaleMap(input: {
  previous: CollectionDefinition;
  next: CollectionDefinition;
  map: Readonly<Record<string, string | null>>;
}): void {
  rejectUnless(Object.keys(input.map).length === input.next.locales.supported.length);
  for (const locale of input.next.locales.supported)
    rejectUnless(
      Object.hasOwn(input.map, locale) &&
        (input.map[locale] === null ||
          input.previous.locales.supported.includes(input.map[locale] ?? '')),
    );
}
