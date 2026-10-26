import type { Principal } from '@new-cms/cms/access';

export type JsonValue = string | number | boolean | null | JsonValue[] | DocumentData;
export interface DocumentData {
  [key: string]: JsonValue;
}
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'select'
  | 'code'
  | 'json'
  | 'point'
  | 'group'
  | 'array'
  | 'blocks'
  | 'tabs'
  | 'row'
  | 'collapsible'
  | 'richText'
  | 'relationship'
  | 'upload'
  | 'join';
export type QueryOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains';
export type Where =
  | { and: readonly Where[] }
  | { or: readonly Where[] }
  | { field: string; operator: QueryOperator; value: JsonValue };
export interface VersionedFunction<T> {
  version: string;
  run: T;
}
export interface FieldPolicyContext {
  actor: Principal;
  operation: string;
  mode?: 'editing' | 'published';
  collectionKey: string;
  locale: string;
  data?: DocumentData;
  previousData?: DocumentData;
  nextData?: DocumentData;
}
export interface CollectionPolicyContext {
  actor: Principal;
  operation: string;
  collectionKey: string;
  locale: string;
  mode: 'editing' | 'published';
  data?: DocumentData;
}
export type FieldPolicy = VersionedFunction<(context: FieldPolicyContext) => boolean>;
export type CollectionPolicy = VersionedFunction<
  (context: CollectionPolicyContext) => boolean | Where
>;
export interface RichTextNodeReference {
  collection: string;
  id: string;
  path: string;
  media?: boolean;
}
export interface RichTextNodeRegistration {
  type: string;
  version: string;
  validate: VersionedFunction<(payload: JsonValue) => boolean>;
  references?: VersionedFunction<(payload: JsonValue) => readonly RichTextNodeReference[]>;
}
export interface FieldAccess {
  read?: FieldPolicy;
  write?: FieldPolicy;
  query?: FieldPolicy;
}
export interface BlockDefinition {
  id: string;
  key: string;
  label: string;
  fields: readonly FieldDefinition[];
}
export interface TabDefinition {
  id: string;
  name?: string;
  label: string;
  fields: readonly FieldDefinition[];
}
export interface FieldDefinition {
  id: string;
  name?: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  localized?: boolean;
  unique?: boolean;
  index?: boolean;
  defaultValue?: JsonValue;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  precision?: number;
  options?: readonly string[];
  hasMany?: boolean;
  fields?: readonly FieldDefinition[];
  blocks?: readonly BlockDefinition[];
  tabs?: readonly TabDefinition[];
  relationTo?: readonly string[];
  onDelete?: 'restrict' | 'nullify' | 'cascade';
  join?: { collection: string; field: string };
  access?: FieldAccess;
  validate?: VersionedFunction<
    (
      value: JsonValue,
      context: { data: DocumentData; locale: string; mode: 'draft' | 'publish' },
    ) => boolean
  >;
}
export interface ContentLimits {
  maxStorageBytes: number;
  maxLocales: number;
  maxFields: number;
  maxFieldDepth: number;
  maxArrayItems: number;
  maxDataBytes: number;
  maxRichTextNodes: number;
  maxRichTextDepth: number;
  maxQueryNodes: number;
  maxQueryDepth: number;
  maxPageSize: number;
  defaultPageSize: number;
  maxExpandDepth: number;
  maxExpandNodes: number;
  maxResponseBytes: number;
  maxSqlQueries: number;
}
export interface CollectionLocales {
  default: string;
  supported: readonly string[];
  fallback: Readonly<Record<string, readonly string[]>>;
  enabled?: readonly string[];
}
export interface ContentLocaleSource extends CollectionLocales {
  enabled: readonly string[];
}
export interface CollectionDefinition {
  id: string;
  key: string;
  schemaVersion: number;
  label: string;
  fields: readonly FieldDefinition[];
  mode: 'direct' | 'drafts';
  localizeStatus?: boolean;
  localeSource?: string;
  publicationLocalesField?: string;
  history: false | { maxVersions: number; retentionMs: number };
  singleton?: boolean;
  locales: CollectionLocales;
  indexes?: readonly { id: string; fields: readonly string[]; unique?: boolean }[];
  search?: readonly string[];
  defaultSort?: readonly SortField[];
  access?: Readonly<Record<string, CollectionPolicy>>;
  upload?: {
    mimeTypes: readonly string[];
    variants: readonly {
      name: string;
      width: number;
      height: number;
      fit: 'cover' | 'contain' | 'inside';
    }[];
  };
  extensions?: readonly {
    id: string;
    version: string;
    transform?: (data: DocumentData) => DocumentData;
    validate?: (data: DocumentData) => boolean;
    afterCommit?: string;
  }[];
  richTextNodes?: readonly RichTextNodeRegistration[];
  previousSchemas?: readonly CollectionDefinition[];
  migrations?: readonly {
    from: number;
    version: string;
    localeMap?: Readonly<Record<string, string | null>>;
    transform: (data: DocumentData) => DocumentData;
  }[];
}
export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}
export interface ContentRegistry {
  list: readonly CollectionDefinition[];
  behaviorHash: string;
  get(key: string): CollectionDefinition;
}
export interface ReferenceValue {
  collection: string;
  id: string;
  path: string;
  fieldId: string;
  onDelete: 'restrict' | 'nullify' | 'cascade';
  media: boolean;
}
