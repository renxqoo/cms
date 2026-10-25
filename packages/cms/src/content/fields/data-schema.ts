import type { CollectionDefinition, ContentRegistry, FieldDefinition } from '../definition.ts';
import { dataFields } from './structure.ts';
type ContractMode = 'draft' | 'published' | 'read';
interface DataSchema {
  [key: string]: unknown;
}
function scalarSchema(field: FieldDefinition): DataSchema {
  if (field.type === 'number')
    return {
      type: 'number',
      ...(field.min === undefined ? {} : { minimum: field.min }),
      ...(field.max === undefined ? {} : { maximum: field.max }),
    };
  if (field.type === 'boolean') return { type: 'boolean' };
  if (field.type === 'point')
    return {
      type: 'array',
      prefixItems: [
        { type: 'number', minimum: -180, maximum: 180 },
        { type: 'number', minimum: -90, maximum: 90 },
      ],
      minItems: 2,
      maxItems: 2,
    };
  if (field.type === 'json') return {};
  if (field.type === 'richText')
    return {
      type: 'object',
      properties: { version: { const: 1 }, children: { type: 'array', items: { type: 'object' } } },
      required: ['version', 'children'],
      additionalProperties: false,
    };
  if (field.type === 'relationship' || field.type === 'upload')
    return {
      type: 'object',
      properties: {
        collection: { type: 'string', enum: field.relationTo },
        id: { type: 'string', format: 'uuid' },
      },
      required: ['collection', 'id'],
      additionalProperties: false,
    };
  if (field.type === 'select') return { type: 'string', enum: field.options };
  return {
    type: 'string',
    ...(field.type === 'date' ? { format: 'date-time' } : {}),
    ...(field.type === 'email' ? { format: 'email' } : {}),
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
  };
}
function fieldSchema(field: FieldDefinition, mode: ContractMode): DataSchema {
  let schema: DataSchema;
  if (field.type === 'group') schema = objectSchema(field.fields ?? [], mode);
  else if (field.type === 'array')
    schema = {
      type: 'array',
      items: objectSchema(field.fields ?? [], mode, { id: { type: 'string', format: 'uuid' } }),
    };
  else if (field.type === 'blocks')
    schema = {
      type: 'array',
      items: {
        oneOf: (field.blocks ?? []).map((block) =>
          objectSchema(block.fields, mode, {
            id: { type: 'string', format: 'uuid' },
            blockType: { const: block.key },
          }),
        ),
      },
    };
  else schema = scalarSchema(field);
  if (mode === 'read' && ['relationship', 'upload', 'join'].includes(field.type))
    schema = relationReadSchema(field);
  if (field.hasMany) schema = { type: 'array', items: schema, uniqueItems: true };
  return mode === 'published' && field.required ? schema : { anyOf: [schema, { type: 'null' }] };
}
function objectSchema(
  fields: readonly FieldDefinition[],
  mode: ContractMode,
  extra: Record<string, DataSchema> = {},
): DataSchema {
  const values = dataFields(fields).filter((field) => mode === 'read' || field.type !== 'join');
  return {
    type: 'object',
    properties: {
      ...extra,
      ...Object.fromEntries(values.map((field) => [field.name, fieldSchema(field, mode)])),
    },
    required: [
      ...Object.keys(extra).filter((key) => key !== 'id' || mode === 'read'),
      ...values
        .filter((field) => mode === 'published' && field.required)
        .map((field) => field.name),
    ],
    additionalProperties: false,
  };
}
export function generateCollectionSchema(
  collection: CollectionDefinition,
  mode: ContractMode = 'read',
): DataSchema {
  return objectSchema(collection.fields, mode);
}
export function generateDataSchemas(
  registry: ContentRegistry,
  mode: ContractMode = 'read',
): Readonly<Record<string, DataSchema>> {
  return Object.fromEntries(
    registry.list.map((collection) => [collection.key, generateCollectionSchema(collection, mode)]),
  );
}
function relationReadSchema(field: FieldDefinition): DataSchema {
  const expanded = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      collection: { type: 'string', ...(field.relationTo ? { enum: field.relationTo } : {}) },
      revision: { type: 'integer' },
      versionId: { type: 'string', format: 'uuid' },
      data: { type: 'object' },
    },
    required: ['id', 'collection', 'revision', 'versionId', 'data'],
  };
  const schema = {
    anyOf: [scalarSchema({ ...field, type: 'relationship' }), expanded, { type: 'null' }],
  };
  return field.type === 'join' ? { type: 'array', items: schema } : schema;
}
