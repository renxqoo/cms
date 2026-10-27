import type { CollectionUpload } from './collections/upload-config.ts';
import type {
  AdminFieldOptions,
  AdminCollectionOptions,
  AdminComponentRegistration,
  AdminComponentReference,
} from './collections/admin-types.ts';
import type { PresetConstraints } from './queries/preset-access-contracts.ts';
import type { JoinDefinition } from './joins/definition.ts';
import type { Principal } from '@new-cms/cms/access';

export type LocalizedLabel = string | Readonly<Record<string, string>>;

export type JsonValue = string | number | boolean | null | JsonValue[] | DocumentData;
export interface DocumentData {
  [key: string]: JsonValue;
}
export type FieldType =
  | 'text'
  | 'slug'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'email'
  | 'select'
  | 'radio'
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
  | 'join'
  | 'ui';
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
  | 'contains'
  | 'all'
  | 'like'
  | 'notLike'
  | 'near'
  | 'within'
  | 'intersects';
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
  documentId?: string;
  path?: string;
  siblingData?: DocumentData;
  blockData?: DocumentData;
  signal?: AbortSignal;
}
export interface CollectionPolicyContext {
  actor: Principal;
  operation: string;
  collectionKey: string;
  locale: string;
  mode: 'editing' | 'published';
  data?: DocumentData;
  signal?: AbortSignal;
}
export type FieldPolicy = VersionedFunction<(context: FieldPolicyContext) => MaybePromise<boolean>>;
export type CollectionPolicy = VersionedFunction<
  (context: CollectionPolicyContext) => MaybePromise<boolean | Where>
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
  validate?: FieldPolicy;
  read?: FieldPolicy;
  write?: FieldPolicy;
  query?: FieldPolicy;
}
export interface ContentHookContext {
  actor: Readonly<Principal>;
  operation: string;
  collectionKey: string;
  locale: string;
  mode: 'editing' | 'published';
  documentId?: string;
  data?: DocumentData;
  previousData?: DocumentData;
  value?: JsonValue;
  path?: string;
  errorCode?: string;
  signal?: AbortSignal;
}
export type MaybePromise<T> = T | Promise<T>;
export interface FieldValueContext {
  data: DocumentData;
  locale: string;
  mode: 'draft' | 'publish';
  actor?: Readonly<Principal>;
  operation?: string;
  signal?: AbortSignal;
}
export interface AdminConditionContext extends ContentHookContext {
  data: DocumentData;
  siblingData: DocumentData;
  blockData?: DocumentData;
}
export type ContentDataHook = VersionedFunction<
  (context: ContentHookContext & { data: DocumentData }) => MaybePromise<DocumentData | undefined>
>;
export type ContentObserverHook = VersionedFunction<
  (context: ContentHookContext) => MaybePromise<void>
>;
export interface CollectionHooks {
  beforeOperation?: readonly ContentObserverHook[];
  afterOperation?: readonly ContentObserverHook[];
  beforeValidate?: readonly ContentDataHook[];
  beforeChange?: readonly ContentDataHook[];
  afterChange?: readonly ContentObserverHook[];
  beforePublish?: readonly ContentObserverHook[];
  beforeRead?: readonly VersionedFunction<
    (context: ContentHookContext) => MaybePromise<Where | undefined>
  >[];
  afterRead?: readonly ContentDataHook[];
  beforeDelete?: readonly ContentObserverHook[];
  afterDelete?: readonly ContentObserverHook[];
  afterError?: readonly ContentObserverHook[];
}
export interface FieldHooks {
  beforeValidate?: readonly VersionedFunction<
    (context: ContentHookContext) => MaybePromise<JsonValue | undefined>
  >[];
  beforeChange?: readonly VersionedFunction<
    (context: ContentHookContext) => MaybePromise<JsonValue | undefined>
  >[];
  afterRead?: readonly VersionedFunction<
    (context: ContentHookContext) => MaybePromise<JsonValue | undefined>
  >[];
  afterChange?: readonly ContentObserverHook[];
}
export interface BlockDefinition {
  admin?: { components?: { Block?: AdminComponentReference; Label?: AdminComponentReference } };
  id: string;
  key: string;
  label: LocalizedLabel;
  fields: readonly FieldDefinition[];
}
export interface TabDefinition {
  id: string;
  name?: string;
  label: LocalizedLabel;
  fields: readonly FieldDefinition[];
}
export interface FilterOptionsContext extends ContentHookContext {
  data: DocumentData;
  siblingData: DocumentData;
  blockData?: DocumentData;
  relationTo?: string;
  options: readonly FieldOption[];
  blockKeys: readonly string[];
  path: string;
}
export interface FieldDefinition {
  disableDuplicate?: boolean;
  id: string;
  name?: string;
  type: FieldType;
  label?: LocalizedLabel;
  required?: boolean;
  localized?: boolean;
  unique?: boolean;
  index?: boolean;
  defaultValue?:
    | JsonValue
    | VersionedFunction<(context: FieldValueContext) => MaybePromise<JsonValue | undefined>>;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  precision?: number;
  timezone?:
    | boolean
    | {
        defaultTimezone?: string;
        supportedTimezones?: readonly FieldOption[];
        required?: boolean;
        override?: VersionedFunction<(context: { baseField: FieldDefinition }) => FieldDefinition>;
      };
  timezoneFor?: string;
  useAsSlug?: string;
  slugify?: VersionedFunction<
    (
      context: ContentHookContext & {
        data: DocumentData;
        siblingData: DocumentData;
        blockData?: DocumentData;
        valueToSlugify: string;
      },
    ) => MaybePromise<string>
  >;
  options?: readonly FieldOption[];
  hasMany?: boolean;
  maxDepth?: number;
  filterOptions?:
    | Where
    | boolean
    | readonly string[]
    | VersionedFunction<
        (context: FilterOptionsContext) => MaybePromise<boolean | Where | readonly FieldOption[]>
      >;
  minRows?: number;
  maxRows?: number;
  fields?: readonly FieldDefinition[];
  blocks?: readonly BlockDefinition[];
  tabs?: readonly TabDefinition[];
  relationTo?: readonly string[];
  onDelete?: 'restrict' | 'nullify' | 'cascade';
  join?: JoinDefinition;
  access?: FieldAccess;
  hooks?: FieldHooks;
  virtual?:
    | true
    | string
    | VersionedFunction<(context: ContentHookContext) => MaybePromise<JsonValue | undefined>>;
  admin?: AdminFieldOptions;
  validate?: VersionedFunction<
    (value: JsonValue, context: FieldValueContext) => MaybePromise<boolean>
  >;
}
export type FieldOption =
  | string
  | { value: string; label: string | Readonly<Record<string, string>> };
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
  maxHookCalls: number;
  maxHookDurationMs: number;
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
  enableQueryPresets?: boolean;
  queryPresetConstraints?: PresetConstraints;
  filterQueryPresetConstraints?: VersionedFunction<
    (context: FilterOptionsContext) => MaybePromise<boolean | readonly FieldOption[]>
  >;
  labels?: { singular?: LocalizedLabel; plural?: LocalizedLabel };
  id: string;
  key: string;
  schemaVersion: number;
  label: string;
  fields: readonly FieldDefinition[];
  mode: 'direct' | 'drafts';
  drafts?: { validate?: boolean; autosave?: boolean | { intervalMs?: number }; schedule?: boolean };
  localizeStatus?: boolean;
  defaultPopulate?: readonly string[];
  localeSource?: string;
  publicationLocalesField?: string;
  history: false | { maxVersions: number; retentionMs: number };
  singleton?: boolean;
  disableBulkEdit?: boolean;
  disableBulkDelete?: boolean;
  disableDuplicate?: boolean;
  authorship?: boolean | { createdBy?: boolean; updatedBy?: boolean };
  hierarchy?: boolean | HierarchyConfig;
  tags?: boolean | HierarchyConfig;
  orderable?: boolean;
  lockDocuments?: false | { durationMs: number; heartbeatMs: number };
  preview?: {
    url: VersionedFunction<
      (input: {
        collection: string;
        id: string;
        locale: string;
        data: DocumentData;
      }) => string | null
    >;
    origins: readonly string[];
    devices: readonly { name: string; width: number; height: number }[];
  };
  livePreview?: boolean;
  locales: CollectionLocales;
  indexes?: readonly { id: string; fields: readonly string[]; unique?: boolean }[];
  search?: readonly string[];
  defaultSort?: readonly SortField[];
  access?: Readonly<Record<string, CollectionPolicy>>;
  hooks?: CollectionHooks;
  admin?: AdminCollectionOptions;
  upload?: CollectionUpload;
  extensions?: readonly {
    id: string;
    version: string;
    afterCommit: string;
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
export interface HierarchyConfig {
  kind?: 'hierarchy' | 'tags';
  parentFieldName?: string;
  slugField?: string;
  slugify?: VersionedFunction<(value: string) => string>;
  slugPathFieldName?: string;
  titlePathFieldName?: string;
  allowHasMany?: boolean;
  collectionSpecific?: boolean | { fieldName: string };
  joinField?: { name: string };
  admin?: {
    treeLimit?: number;
    useHeaderButton?: boolean;
    injectSidebarTab?: boolean;
    components?: { Icon?: AdminComponentReference; SmallIcon?: AdminComponentReference };
  };
}
export interface SortField {
  field: string;
  order: 'asc' | 'desc';
}
export interface ContentRegistry {
  list: readonly CollectionDefinition[];
  behaviorHash: string;
  adminComponents: readonly AdminComponentRegistration[];
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
