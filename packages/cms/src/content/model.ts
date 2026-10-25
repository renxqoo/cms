export const documentMetadataFields = [
  'id',
  'collection',
  'revision',
  'versionId',
  'publishedVersionId',
  'trashedAt',
  'createdAt',
  'updatedAt',
  'folderId',
] as const;
import type { PhysicalPlan } from '@new-cms/database/schema-plan';
import type {
  CollectionDefinition,
  DocumentData,
  FieldDefinition,
  SortField,
  Where,
} from './definition.ts';

export interface DocumentRow {
  id: string;
  collectionId: string;
  revision: number;
  currentVersionId: string;
  publishedVersionId: string | null;
  trashedAt: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface RevisionRow {
  id: string;
  documentId: string;
  collectionId: string;
  revision: number;
  schemaVersion: number;
  kind: string;
  actorId: string;
  createdAt: string;
}
export interface DocumentView {
  id: string;
  collection: string;
  revision: number;
  versionId: string;
  publishedVersionId: string | null;
  trashedAt: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  data: DocumentData;
}
export interface QueryInput {
  where?: Where;
  policy?: Where;
  sort?: readonly SortField[];
  q?: string;
  page: number;
  pageSize: number;
  locale: string;
  fallback: readonly string[];
  mode: 'editing' | 'published';
  trashed?: boolean;
  folderId?: string | null;
  select?: readonly string[];
  depth?: number;
}
export interface FieldMapping {
  field: FieldDefinition;
  path: string;
  identityPath: string;
  table: string;
  parent?: FieldMapping;
  children: readonly FieldMapping[];
  blockKey?: string;
  localized: boolean;
  columnType: 'uuid' | 'text' | 'double precision' | 'boolean' | 'timestamptz' | 'jsonb';
  structural: boolean;
  searchable: boolean;
}
export interface IndexMapping {
  id: string;
  table: string;
  fields: readonly FieldMapping[];
}
export interface CompiledCollection {
  definition: CollectionDefinition;
  fields: readonly FieldMapping[];
  flat: readonly FieldMapping[];
  fingerprint: string;
  indexes: readonly IndexMapping[];
}
export interface ContentMapping {
  collections: readonly CompiledCollection[];
  plan: PhysicalPlan;
  fingerprint: string;
  get(key: string, schemaVersion?: number): CompiledCollection;
}
export interface StoredDocument {
  document: DocumentRow;
  version: RevisionRow;
  data: DocumentData;
}
export interface StoredPage {
  rows: StoredDocument[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CollectionSchemaIdentity {
  dataFingerprint: string;
  id: string;
  key: string;
  schemaVersion: number;
}
export interface ContentSchemaSnapshot {
  plan: PhysicalPlan;
  collections: readonly CollectionSchemaIdentity[];
}
export interface ContentSchemaBackfill {
  collection: string;
  from: number;
  to: number;
}

export interface RelationScope {
  collection: string;
  locale: string;
  fallback: readonly string[];
  policy: Where | boolean;
  queryableFields: readonly string[];
}
