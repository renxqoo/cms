import { physicalName } from './names.ts';
import { compileIndexes, indexTables } from './compile-indexes.ts';
import { planFingerprint } from '@new-cms/database/codegen';
import type { PhysicalColumn, PhysicalPlan, PhysicalTable } from '@new-cms/database/schema-plan';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, ContentRegistry, FieldDefinition } from '../../definition.ts';
import type { CompiledCollection, ContentMapping, FieldMapping } from '../../model.ts';
import { dataFields, structural } from '../../fields/structure.ts';

function columnType(field: FieldDefinition): FieldMapping['columnType'] {
  if (field.type === 'number') return 'double precision';
  if (field.type === 'boolean') return 'boolean';
  if (field.type === 'date') return 'timestamptz';
  if (['json', 'richText', 'point'].includes(field.type)) return 'jsonb';
  if (field.type === 'relationship' || field.type === 'upload') return 'uuid';
  return 'text';
}
function compileFields(input: {
  collection: CollectionDefinition;
  fields: readonly FieldDefinition[];
  parent?: FieldMapping;
  blockKey?: string;
}): FieldMapping[] {
  return dataFields(input.fields)
    .filter((field) => field.type !== 'join' && !field.virtual)
    .map((field) => {
      const identityPath = input.parent
        ? `${input.parent.identityPath}.${field.id}`
        : `${input.collection.id}.${field.id}`;
      const mapping: FieldMapping = {
        field,
        path: input.parent ? `${input.parent.path}.${field.name}` : String(field.name),
        identityPath,
        table: fieldTableName(input, field, identityPath),
        children: [],
        localized: field.localized === true || input.parent?.localized === true,
        columnType: columnType(field),
        structural: structural(field),
        searchable: (input.collection.search ?? []).includes(
          input.parent ? `${input.parent.path}.${field.name}` : String(field.name),
        ),
        ...(input.parent ? { parent: input.parent } : {}),
        ...(input.blockKey ? { blockKey: input.blockKey } : {}),
      };
      if (field.type === 'blocks')
        mapping.children = (field.blocks ?? []).flatMap((block) =>
          compileFields({ ...input, fields: block.fields, parent: mapping, blockKey: block.key }),
        );
      else
        mapping.children = compileFields({
          collection: input.collection,
          fields: field.fields ?? [],
          parent: mapping,
        });
      return mapping;
    });
}
function flatten(fields: readonly FieldMapping[]): FieldMapping[] {
  return fields.flatMap((field) => [field, ...flatten(field.children)]);
}
function fieldColumns(mapping: FieldMapping): PhysicalColumn[] {
  const columns: PhysicalColumn[] = [
    { name: 'revision_id', type: 'uuid' },
    { name: 'document_id', type: 'uuid' },
    { name: 'locale', type: 'text' },
    { name: 'parent_path', type: 'text' },
    { name: 'position', type: 'integer' },
    { name: 'state', type: 'text' },
    { name: 'value', type: mapping.columnType, nullable: true },
  ];
  if (mapping.structural)
    columns.push(
      { name: 'item_id', type: 'uuid', nullable: true },
      { name: 'block_type', type: 'text', nullable: true },
    );
  if (mapping.columnType === 'uuid')
    columns.push({ name: 'target_collection_id', type: 'text', nullable: true });
  if (mapping.searchable)
    columns.push({
      name: 'search_vector',
      type: 'tsvector',
      generated: { kind: 'textSearch', column: 'value' },
    });
  return columns;
}
function fieldTable(mapping: FieldMapping): PhysicalTable {
  const columns = fieldColumns(mapping);
  const indexes: PhysicalTable['indexes'][number][] = [
    {
      name: physicalName('ix', `${mapping.table}:revision`),
      columns: ['revision_id', 'locale'],
    },
  ];
  if (mapping.field.index || mapping.field.unique)
    indexes.push({
      name: physicalName('ix', `${mapping.table}:value`),
      columns: ['value', 'locale', 'revision_id'],
    });
  if (mapping.searchable)
    indexes.push({
      name: physicalName('ix', `${mapping.table}:search`),
      columns: ['search_vector'],
      method: 'gin',
    });
  const foreignKeys: PhysicalTable['foreignKeys'][number][] = [
    {
      name: physicalName('fk', mapping.identityPath),
      columns: ['revision_id', 'document_id'],
      targetTable: 'content_revisions',
      targetColumns: ['id', 'document_id'],
      onDelete: 'cascade',
    },
  ];
  if (mapping.columnType === 'uuid')
    foreignKeys.push({
      name: physicalName('fk', `${mapping.identityPath}:target`),
      columns: ['value', 'target_collection_id'],
      targetTable: 'content_documents',
      targetColumns: ['id', 'collection_id'],
      onDelete: 'restrict',
    });
  return {
    name: mapping.table,
    columns,
    primaryKey: ['revision_id', 'locale', 'parent_path', 'position'],
    indexes,
    foreignKeys,
  };
}
export function reservationDefinitions(
  collection: CompiledCollection,
): { id: string; fields: readonly FieldMapping[] }[] {
  const indexes = (collection.definition.indexes ?? [])
    .filter((index) => index.unique)
    .map((index) => ({
      id: index.id,
      fields: index.fields.map((path) => {
        const field = collection.flat.find((item) => item.path === path);
        if (!field) fail('invalid_input');
        return field;
      }),
    }));
  for (const field of collection.flat)
    if (field.field.unique) indexes.push({ id: field.identityPath, fields: [field] });
  return indexes;
}
export function reservationTableName(
  collection: CompiledCollection,
  reservation: { id: string; fields: readonly FieldMapping[] },
): string {
  return physicalName(
    'cu',
    `${collection.definition.id}:${reservation.id}:${reservation.fields.map((field) => field.table).join(':')}`,
  );
}
function reservationTables(collection: CompiledCollection): PhysicalTable[] {
  return reservationDefinitions(collection).map((reservation) => {
    const table = reservationTableName(collection, reservation);
    const columns: PhysicalColumn[] = [
      { name: 'document_id', type: 'uuid' },
      { name: 'locale', type: 'text' },
      ...reservation.fields.map((field, index) => ({ name: `k${index}`, type: field.columnType })),
    ];
    const keys = ['locale', ...reservation.fields.map((_field, index) => `k${index}`)];
    return {
      name: table,
      columns,
      primaryKey: ['document_id', ...keys],
      indexes: [{ name: physicalName('uq', table), columns: keys, unique: true }],
      foreignKeys: [
        {
          name: physicalName('fk', table),
          columns: ['document_id'],
          targetTable: 'content_documents',
          targetColumns: ['id'],
          onDelete: 'cascade',
        },
      ],
    };
  });
}
function compileCollection(definition: CollectionDefinition): CompiledCollection {
  const fields = compileFields({ collection: definition, fields: definition.fields });
  const collection: CompiledCollection = {
    definition,
    fields,
    flat: flatten(fields),
    fingerprint: '',
    indexes: [],
  };
  collection.indexes = compileIndexes(collection);
  collection.fingerprint = planFingerprint({
    version: 1,
    tables: [
      ...collection.flat.map(fieldTable),
      ...reservationTables(collection),
      ...indexTables(collection),
    ],
  });
  return collection;
}
export function compileContent(registry: ContentRegistry): ContentMapping {
  const collections = registry.list.flatMap((definition) =>
    [...(definition.previousSchemas ?? []), definition].map(compileCollection),
  );
  const tables = new Map<string, PhysicalTable>();
  for (const collection of collections)
    for (const table of [
      ...collection.flat.map(fieldTable),
      ...reservationTables(collection),
      ...indexTables(collection),
    ]) {
      const existing = tables.get(table.name);
      if (existing) {
        if (JSON.stringify(existing.columns) !== JSON.stringify(table.columns))
          fail('invalid_input');
        const indexes = new Map(
          [...existing.indexes, ...table.indexes].map((index) => [index.name, index]),
        );
        tables.set(table.name, {
          ...table,
          indexes: [...indexes.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
        });
      } else tables.set(table.name, table);
    }
  const plan: PhysicalPlan = {
    version: 1,
    tables: [...tables.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
  };
  return {
    collections,
    plan,
    fingerprint: planFingerprint(plan),
    get(key, schemaVersion) {
      const definition = registry.get(key);
      const result = collections.find(
        (collection) =>
          collection.definition.id === definition.id &&
          collection.definition.schemaVersion === (schemaVersion ?? definition.schemaVersion),
      );
      if (!result) fail('invalid_input');
      return result;
    },
  };
}

function fieldTableName(
  input: { collection: CollectionDefinition; parent?: FieldMapping },
  field: FieldDefinition,
  identityPath: string,
): string {
  const path = input.parent ? `${input.parent.path}.${field.name}` : String(field.name);
  return physicalName(
    'cf',
    `${identityPath}:schema${input.collection.schemaVersion}:${input.parent?.table ?? 'root'}:${field.localized === true || input.parent?.localized === true}:${columnType(field)}:${structural(field)}:${(input.collection.search ?? []).includes(path)}`,
  );
}
