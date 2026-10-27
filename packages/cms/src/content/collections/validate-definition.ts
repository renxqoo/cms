import { validatePagination } from './pagination-config.ts';
import { validateHooks } from './validate-hooks.ts';
import { validateUiField } from './validate-ui-field.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, ContentLimits, FieldDefinition } from '../definition.ts';
import { optionValues } from '../fields/options.ts';
import { assertSelect, dataFields, namedFields, fieldPaths } from '../fields/structure.ts';
import { joinCollections, validateJoinDefinition } from '../joins/config.ts';

const reserved = new Set([
  'id',
  'blockType',
  'collection',
  'revision',
  'versionId',
  'publishedVersionId',
  'createdAt',
  'createdBy',
  'updatedBy',
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
  options: ['select', 'radio'],
  relationTo: ['relationship', 'upload'],
  join: ['join'],
  onDelete: ['relationship', 'upload'],
  maxDepth: ['relationship', 'upload', 'join'],
  filterOptions: ['relationship', 'upload', 'select', 'radio', 'blocks'],
  hasMany: ['text', 'number', 'select', 'relationship', 'upload'],
  minRows: ['text', 'number'],
  maxRows: ['text', 'number'],
  precision: ['number'],
  min: ['number', 'array', 'blocks'],
  max: ['number', 'array', 'blocks'],
  timezone: ['date'],
  timezoneFor: ['select'],
  useAsSlug: ['slug'],
  slugify: ['slug'],
  minLength: ['slug', 'text', 'textarea', 'email', 'code'],
  maxLength: ['slug', 'text', 'textarea', 'email', 'code'],
};
const requiredProperties: Partial<Record<FieldDefinition['type'], keyof FieldDefinition>> = {
  group: 'fields',
  array: 'fields',
  row: 'fields',
  collapsible: 'fields',
  blocks: 'blocks',
  tabs: 'tabs',
  select: 'options',
  radio: 'options',
  relationship: 'relationTo',
  upload: 'relationTo',
  join: 'join',
};
function validateOptions(field: FieldDefinition): void {
  if (field.virtual)
    rejectUnless(
      !field.unique && !field.index && field.defaultValue === undefined && field.type !== 'join',
    );
  for (const [key, types] of Object.entries(optionTypes)) {
    if (Object.hasOwn(field, key) && !types.includes(field.type)) fail('invalid_input');
  }
  const required = requiredProperties[field.type];
  if (required && field[required] === undefined) fail('invalid_input');
  validateFilterOptions(field);
  if (field.options) rejectUnless(unique(optionValues(field)));
  if (field.relationTo) rejectUnless(unique(field.relationTo));
  if (field.blocks) rejectUnless(unique(field.blocks.map((block) => block.key)));
  if (field.minRows !== undefined || field.maxRows !== undefined)
    rejectUnless(field.hasMany === true);
  validateBoundaries(field);
  validateFieldShape(field);
}
function validateFilterOptions(field: FieldDefinition): void {
  const configured = field.filterOptions;
  if (configured === undefined) return;
  if (typeof configured === 'object' && !Array.isArray(configured) && 'run' in configured) return;
  if (field.type === 'blocks') {
    rejectUnless(typeof configured === 'boolean' || Array.isArray(configured));
    if (Array.isArray(configured))
      rejectUnless(
        unique(configured) &&
          configured.every((key) => field.blocks?.some((block) => block.key === key)),
      );
    return;
  }
  rejectUnless(
    ['relationship', 'upload'].includes(field.type) &&
      typeof configured === 'object' &&
      !Array.isArray(configured),
  );
}
function validateFieldShape(field: FieldDefinition): void {
  if (['row', 'collapsible', 'tabs'].includes(field.type)) {
    rejectUnless(field.disableDuplicate === undefined);
    rejectUnless(
      ![
        field.name,
        field.localized,
        field.required,
        field.unique,
        field.index,
        field.access,
        field.validate,
        field.virtual,
        field.hooks,
      ].some(Boolean),
    );
    rejectUnless(field.defaultValue === undefined);
    return;
  }
  rejectUnless(Boolean(field.name) && !reserved.has(String(field.name)));
  if (field.type === 'ui') return validateUiField(field);
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
  rejectUnless(unique(namedFields(input.fields).map((field) => String(field.name))));
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
          !entry.field.virtual &&
          !['group', 'array', 'blocks', 'join', 'json', 'richText'].includes(entry.field.type),
      );
    }
  }
  rejectUnless(unique((collection.indexes ?? []).map((index) => index.id)));
  for (const path of collection.search ?? []) rejectUnless(searchable(paths.get(path)));
  for (const sort of collection.defaultSort ?? [])
    if (!(sort.field === '_order' && collection.orderable)) validateSort(paths.get(sort.field));
  validateAdmin(collection, paths);
}
function searchable(entry: ReturnType<typeof fieldPaths>[number] | undefined): boolean {
  return (
    entry !== undefined &&
    !entry.field.virtual &&
    ['text', 'textarea', 'email', 'code'].includes(entry.field.type)
  );
}
function validateAdmin(
  collection: CollectionDefinition,
  paths: ReadonlyMap<string, ReturnType<typeof fieldPaths>[number]>,
): void {
  if (collection.admin?.useAsThumbnail) {
    const thumbnail = paths.get(collection.admin.useAsThumbnail);
    rejectUnless(thumbnail?.field.type === 'upload' && !thumbnail.repeated);
  }
  if (collection.admin?.useAsTitle)
    rejectUnless(
      paths.has(collection.admin.useAsTitle) && !paths.get(collection.admin.useAsTitle)?.repeated,
    );
  if (collection.admin?.defaultColumns)
    rejectUnless(
      unique(collection.admin.defaultColumns) &&
        collection.admin.defaultColumns.every((path) =>
          fieldPaths(collection.fields, '', { includeUi: true }).some(
            (entry) => entry.path === path,
          ),
        ),
    );
}
function validateSort(entry: ReturnType<typeof fieldPaths>[number] | undefined): void {
  rejectUnless(
    entry !== undefined &&
      !entry.field.virtual &&
      !entry.repeated &&
      !['group', 'join', 'array', 'blocks'].includes(entry.field.type),
  );
}
function validatePublicationPolicy(collection: CollectionDefinition): void {
  if (collection.publicationLocalesField) {
    const field = dataFields(collection.fields).find(
      (candidate) => candidate.name === collection.publicationLocalesField,
    );
    rejectUnless(
      collection.mode === 'drafts' &&
        !collection.localizeStatus &&
        field !== undefined &&
        !field.localized &&
        (field.type === 'json' || (field.type === 'select' && field.hasMany === true)),
    );
  }
}

export function validateDefinition(
  collection: CollectionDefinition,
  limits: ContentLimits,
  historical = false,
): void {
  validatePagination(collection, limits);
  rejectUnless(collection.mode !== 'drafts' || collection.history !== false);
  rejectUnless(!collection.localizeStatus || collection.mode === 'drafts');
  validateCollectionLocales(collection, limits);
  validatePublicationPolicy(collection);
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
  assertSelect(collection, collection.defaultPopulate);
  validatePaths(collection);
  validateHooks(collection, limits);
  if (!historical) validateMigrations(collection);
  validateSchemaVersions(collection);
}
function virtualSource(input: {
  collection: CollectionDefinition;
  path: string;
  byKey: ReadonlyMap<string, CollectionDefinition>;
  depth: number;
  limits: ContentLimits;
}): boolean {
  if (input.depth > input.limits.maxExpandDepth) return false;
  const paths = fieldPaths(input.collection.fields);
  const direct = paths.find((entry) => entry.path === input.path);
  if (direct) return !direct.field.virtual && direct.field.type !== 'join';
  for (const { field, path } of paths) {
    if (
      !input.path.startsWith(`${path}.`) ||
      !['relationship', 'upload', 'join'].includes(field.type)
    )
      continue;
    const targets = field.join ? joinCollections(field.join) : (field.relationTo ?? []);
    if (
      targets.some((key) => {
        const collection = input.byKey.get(key);
        return (
          collection &&
          virtualSource({
            ...input,
            collection,
            path: input.path.slice(path.length + 1),
            depth: input.depth + 1,
          })
        );
      })
    )
      return true;
  }
  return false;
}

export function validateRelations(
  collections: readonly CollectionDefinition[],
  limits: ContentLimits,
): void {
  const byKey = new Map(collections.map((collection) => [collection.key, collection]));
  for (const collection of collections) {
    for (const { field } of fieldPaths(collection.fields)) {
      if (typeof field.virtual === 'string')
        rejectUnless(virtualSource({ collection, path: field.virtual, byKey, depth: 0, limits }));
      for (const target of field.relationTo ?? []) {
        const definition = byKey.get(target);
        rejectUnless(
          definition !== undefined && (field.type !== 'upload' || definition.upload !== undefined),
        );
      }
      if (field.join) {
        validateJoinDefinition(collection, field, { byKey, limits });
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

function validateBoundaries(field: FieldDefinition): void {
  if (field.min !== undefined && field.max !== undefined) rejectUnless(field.min <= field.max);
  if (field.minRows !== undefined && field.maxRows !== undefined)
    rejectUnless(field.minRows <= field.maxRows);
  if (field.minLength !== undefined && field.maxLength !== undefined)
    rejectUnless(field.minLength <= field.maxLength);
  if (field.unique)
    rejectUnless(!['group', 'array', 'blocks', 'json', 'richText', 'join'].includes(field.type));
}
