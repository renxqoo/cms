import type { RelationScope } from '../../model.ts';
import type { RevisionDataRequest, RevisionDataResult } from './read-data-batch.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  ReferenceValue,
  Where,
  SortField,
} from '../../definition.ts';
import type { DocumentRow, QueryInput, RevisionRow, StoredPage } from '../../model.ts';

export interface StoreCollection {
  collection: string;
}
export interface StoreDocument extends StoreCollection {
  id: string;
}
export interface ReadDocumentInput extends StoreDocument {
  lock?: boolean;
}
export interface InsertDocumentInput extends StoreDocument {
  actorId: string;
  singleton?: boolean;
}
export interface InsertRevisionInput extends StoreCollection {
  documentId: string;
  id: string;
  revision: number;
  actorId: string;
  data: DocumentData;
  dataByLocale?: Readonly<Record<string, DocumentData>>;
  locale: string;
  schemaVersion: number;
  kind: string;
  previousVersionId?: string;
}
export interface ReadRevisionInput extends StoreCollection {
  documentId: string;
  versionId: string;
  locale: string;
  fallback?: readonly string[];
}
export interface UpdatePointersInput extends StoreDocument {
  expectedRevision: number;
  revision: number;
  currentVersionId: string;
  publishedVersionId: string | null;
  trashedAt?: string | null;
  folderId?: string | null;
}
export interface InboundInput extends StoreDocument {
  active?: boolean;
  excludeDocumentId?: string;
  limit?: number;
}
export interface InboundReference {
  sourceDocumentId: string;
  sourceRevisionId: string;
  sourceCollection: string;
  schemaVersion: number;
  path: string;
  fieldId: string;
  onDelete: ReferenceValue['onDelete'];
  active: boolean;
}
export interface CollectionsQueryInput {
  collections: readonly Omit<Parameters<ContentStore['queryDocuments']>[1], 'limits'>[];
  page: number;
  pageSize: number;
  sort: readonly SortField[];
}
export interface ContentStore {
  readDocument(tx: SqlExecutor, input: ReadDocumentInput): Promise<DocumentRow>;
  lockDocuments(tx: SqlExecutor, input: { ids: readonly string[] }): Promise<void>;
  insertDocument(tx: SqlExecutor, input: InsertDocumentInput): Promise<void>;
  insertRevision(tx: SqlExecutor, input: InsertRevisionInput): Promise<RevisionRow>;
  readRevisionData(tx: SqlExecutor, input: ReadRevisionInput): Promise<DocumentData>;
  readRevisionDataBatch(
    tx: SqlExecutor,
    input: { collection: string; items: readonly RevisionDataRequest[] },
  ): Promise<RevisionDataResult[]>;
  readRevision(
    tx: SqlExecutor,
    input: { collection: string; documentId: string; versionId: string },
  ): Promise<RevisionRow>;
  updateDocumentPointers(tx: SqlExecutor, input: UpdatePointersInput): Promise<DocumentRow>;
  queryDocuments(
    tx: SqlExecutor,
    input: {
      collection: string;
      query: QueryInput;
      where?: Where;
      queryableFields?: readonly string[];
      relationScopes?: readonly RelationScope[];
      limits: ContentLimits;
    },
  ): Promise<StoredPage>;
  listVersions(
    tx: SqlExecutor,
    input: { collection: string; id: string; page: number; pageSize: number },
  ): Promise<{ rows: RevisionRow[]; total: number; page: number; pageSize: number }>;
  queryCollections(
    tx: SqlExecutor,
    input: CollectionsQueryInput & { limits: ContentLimits },
  ): Promise<StoredPage>;
  listPrunableVersions(
    tx: SqlExecutor,
    input: {
      collection: string;
      id: string;
      protectedIds: readonly string[];
      keepLatest: number;
      olderThan: string | null;
      limit: number;
    },
  ): Promise<RevisionRow[]>;
  syncActiveUnique(tx: SqlExecutor, input: StoreDocument): Promise<void>;
  inboundReferences(tx: SqlExecutor, input: InboundInput): Promise<InboundReference[]>;
  writeReferences(
    tx: SqlExecutor,
    input: {
      collection: string;
      documentId: string;
      versionId: string;
      schemaVersion?: number;
      references: readonly ReferenceValue[];
    },
  ): Promise<void>;
  removeRevision(
    tx: SqlExecutor,
    input: { collection: string; documentId: string; versionId: string },
  ): Promise<void>;
  purgeDocument(tx: SqlExecutor, input: StoreDocument): Promise<void>;
  backfillSchema(
    tx: SqlExecutor,
    input: { collection: string; from: number; to: number; pageSize: number; cursor?: string },
  ): Promise<{ processed: number; cursor: string | null; complete: boolean }>;
  activateSchema(tx: SqlExecutor): Promise<{ fingerprint: string; collections: string[] }>;
  verifyReady(tx: SqlExecutor): Promise<void>;
  definition(collection: string, schemaVersion?: number): CollectionDefinition;
}
