import type { ContentRegistry, FieldDefinition } from '../definition.ts';
import { optionValues } from '../fields/options.ts';
import { conditionalContractFields } from '../fields/contract-fields.ts';
import { dataFields } from '../fields/structure.ts';
import { joinCollections } from '../joins/config.ts';

type ContractMode = 'draft' | 'published' | 'read';
function typeOf(field: FieldDefinition, mode: ContractMode): string {
  const type = typeBuilders[field.type]?.(field, mode) ?? scalarTypes[field.type] ?? 'string';
  return field.hasMany ? `(${type})[]` : type;
}
const scalarTypes: Partial<Record<FieldDefinition['type'], string>> = {
  number: 'number',
  boolean: 'boolean',
  point: '[number,number]',
  json: 'JsonValue',
  richText: 'JsonValue',
};
const typeBuilders: Partial<
  Record<FieldDefinition['type'], (field: FieldDefinition, mode: ContractMode) => string>
> = {
  group: (field, mode) => objectType(field.fields ?? [], mode),
  array: (field, mode) =>
    `({id${mode === 'read' ? '' : '?'}:string} & ${objectType(field.fields ?? [], mode)})[]`,
  blocks: (field, mode) =>
    `(${(field.blocks ?? []).map((block) => `{id${mode === 'read' ? '' : '?'}:string;blockType:${JSON.stringify(block.key)}} & ${objectType(block.fields, mode)}`).join(' | ')})[]`,
  select: (field) =>
    optionValues(field)
      .map((option) => JSON.stringify(option))
      .join(' | '),
  radio: (field) =>
    optionValues(field)
      .map((option) => JSON.stringify(option))
      .join(' | '),
  relationship: relationType,
  upload: relationType,
  join: (field) =>
    `JoinPage<{collection:${(field.join ? joinCollections(field.join) : []).map((key) => JSON.stringify(key)).join(' | ')};id:string} | ExpandedDocument<${(field.join ? joinCollections(field.join) : []).map((key) => JSON.stringify(key)).join(' | ')}>>`,
};
function relationType(field: FieldDefinition, mode: ContractMode): string {
  const targets = (field.relationTo ?? []).map((target) => JSON.stringify(target)).join(' | ');
  const reference = `{collection:${targets};id:string}`;
  return mode === 'read' ? `${reference} | ExpandedDocument<${targets}> | null` : reference;
}
function objectType(fields: readonly FieldDefinition[], mode: ContractMode): string {
  const visible = dataFields(fields).filter(
    (field) => mode === 'read' || (field.type !== 'join' && !field.virtual),
  );
  return `{${visible.map((field) => `${JSON.stringify(field.name)}${mode === 'published' && field.required ? '' : '?'}:${typeOf(field, mode)}${mode === 'published' && field.required ? '' : ' | null'};`).join(' ')}}`;
}
export function generateTypes(registry: ContentRegistry): string {
  const maps = [
    ['DraftData', 'draft'],
    ['PublishedData', 'published'],
    ['ReadData', 'read'],
  ] as const;
  const definitions = maps.map(
    ([name, mode]) =>
      `export interface ${name} {\n${registry.list.map((collection) => `${JSON.stringify(collection.key)}:${objectType(mode === 'published' ? conditionalContractFields(collection.fields) : collection.fields, mode)};`).join('\n')}\n}`,
  );
  return `export type JsonValue=string|number|boolean|null|JsonValue[]|{[key:string]:JsonValue};\nexport interface Relation {collection:string;id:string}\nexport interface JoinPage<T>{rows:T[];page:number;pageSize:number;hasNextPage:boolean;total?:number;orderVersion?:string;sort:{field:string;order:'asc'|'desc'}[]}\n${definitions.join('\n')}\nexport type ExpandedDocument<C extends keyof ReadData=keyof ReadData>=C extends keyof ReadData ? {id:string;collection:C;revision:number;versionId:string;publishedVersionId:string|null;trashedAt:string|null;folderId:string|null;createdAt:string;updatedAt:string;createdBy?:{id:string;displayName:string|null}|null;updatedBy?:{id:string;displayName:string|null}|null;data:ReadData[C]} : never;\n`;
}
