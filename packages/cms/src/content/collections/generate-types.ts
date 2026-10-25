import type { ContentRegistry, FieldDefinition } from '../definition.ts';
import { dataFields } from '../fields/structure.ts';

type ContractMode = 'draft' | 'published' | 'read';
function typeOf(field: FieldDefinition, mode: ContractMode): string {
  const type = typeBuilders[field.type]?.(field, mode) ?? scalarTypes[field.type] ?? 'string';
  return field.hasMany ? `(${type})[]` : type;
}
const scalarTypes: Partial<Record<FieldDefinition['type'], string>> = {
  number: 'number',
  boolean: 'boolean',
  join: '(Relation | ExpandedDocument | null)[]',
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
  select: (field) => (field.options ?? []).map((option) => JSON.stringify(option)).join(' | '),
  relationship: relationType,
  upload: relationType,
};
function relationType(field: FieldDefinition, mode: ContractMode): string {
  const targets = (field.relationTo ?? []).map((target) => JSON.stringify(target)).join(' | ');
  const reference = `{collection:${targets};id:string}`;
  return mode === 'read' ? `${reference} | ExpandedDocument<${targets}> | null` : reference;
}
function objectType(fields: readonly FieldDefinition[], mode: ContractMode): string {
  const visible = dataFields(fields).filter((field) => mode === 'read' || field.type !== 'join');
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
      `export interface ${name} {\n${registry.list.map((collection) => `${JSON.stringify(collection.key)}:${objectType(collection.fields, mode)};`).join('\n')}\n}`,
  );
  return `export type JsonValue=string|number|boolean|null|JsonValue[]|{[key:string]:JsonValue};\nexport interface Relation {collection:string;id:string}\n${definitions.join('\n')}\nexport type ExpandedDocument<C extends keyof ReadData=keyof ReadData>=C extends keyof ReadData ? {id:string;collection:C;revision:number;versionId:string;publishedVersionId:string|null;trashedAt:string|null;folderId:string|null;createdAt:string;updatedAt:string;data:ReadData[C]} : never;\n`;
}
