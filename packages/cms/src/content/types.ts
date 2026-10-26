import type { AccessAuthorization, Principal } from '@new-cms/cms/access';
import type { CmsPolicy, RequestContext, Scope } from '@new-cms/cms/platform/contracts';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import type { AssetsApi } from '@new-cms/cms/assets';
import type {
  ManifestSummary,
  AssetLimits,
  AssetDiscoverySources,
  AssetsParticipants,
  ContentAuthorizer,
} from '@new-cms/cms/assets/composition';
import type {
  ContentLimits,
  ContentRegistry,
  DocumentData,
  ContentLocaleSource,
} from './definition.ts';
import type { ContentMapping, DocumentView, RelationScope } from './model.ts';
import type { ContentStore } from './adapters/postgres/store-contract.ts';
import type { CollectionDefinition, Where } from './definition.ts';
import type { contentInputSchemas } from './input-schemas.ts';

export interface ContentWorkPolicy {
  resourceLockKey: number;
  maxBatchItems: number;
  maxSyncBatchItems: number;
  jobBatchSize: number;
  jobLeaseMs: number;
  jobMaxAttempts: number;
  maxScheduleDelayMs: number;
  trashRetentionMs: number;
  maxFolders: number;
  maxFolderDepth: number;
}

export interface ContentOptions {
  database: Database;
  policy: CmsPolicy;
  limits: ContentLimits;
  workPolicy: ContentWorkPolicy;
  registry: ContentRegistry;
  mapping: ContentMapping;
  resolveLocaleSource?(source: string, tx: SqlExecutor): Promise<ContentLocaleSource>;
  validateAfterMutation?(
    tx: SqlExecutor,
    input: { collection: string; operationId: string },
  ): Promise<void>;
  validatePublication?(input: {
    collection: string;
    locale: string;
    data: DocumentData;
    media: readonly { sourcePath: string; mimeType: string }[];
  }): boolean;
  authorize: AccessAuthorization;
  authorizeActor(
    tx: SqlExecutor,
    input: { actorId: string; operationId: string; scope: Scope },
  ): Promise<Principal>;
  assets?: AssetsParticipants;
  uploadApi?: AssetsApi;
  uploadPolicy: {
    maxBytes: number;
    variantQuality: number;
    variantFormat: 'jpeg' | 'png' | 'webp';
    imageLimits: Pick<
      AssetLimits,
      'maxOutputBytes' | 'maxPixels' | 'maxFrames' | 'maxWidth' | 'maxHeight' | 'maxVariants'
    >;
  };
  assetDiscoverySources(input: { actorId: string; collectionKey: string }): AssetDiscoverySources;
  readAssetJob(
    ctx: RequestContext,
    input: { collection: string; jobId: string },
    tx?: SqlExecutor,
  ): Promise<unknown>;
  afterCommitHandlers: Readonly<
    Record<
      string,
      (input: {
        id: string;
        collection: string;
        documentId: string;
        revisionId: string;
        signal: AbortSignal;
      }) => Promise<void>
    >
  >;
}

export interface ContentRuntime extends ContentOptions {
  store: ContentStore;
  resolveCollection(tx: SqlExecutor, key: string): Promise<CollectionDefinition>;
  schemas: ReturnType<typeof contentInputSchemas>;
  resolveRelationScopes(state: ContentState): Promise<{ relationScopes: RelationScope[] }>;
}

export interface ContentState {
  tx: SqlExecutor;
  ctx: RequestContext;
  actor: Principal;
  collection: CollectionDefinition;
  operationId: string;
  locale: string;
  mode: 'editing' | 'published';
  predicate?: Where;
  actorAuthorization?: boolean;
  fallbackOverride?: readonly string[];
}

export interface DocumentTarget {
  collection: string;
  id: string;
}

export interface ContentWriteInput extends DocumentTarget {
  revision: number;
  data?: DocumentData | undefined;
  dataByLocale?: Readonly<Record<string, DocumentData>> | undefined;
  locale?: string | undefined;
  folderId?: string | null | undefined;
  uploadId?: string | undefined;
}

export interface JobReference {
  id: string;
  collection: string;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
}

export type ContentMediaAuthorizer = ContentAuthorizer;

export interface ContentDocumentView extends DocumentView {
  file?: ManifestSummary;
  mediaBindings?: {
    bindingId: string;
    sourcePath: string;
    mediaDocumentId: string;
    mediaCollectionKey: string;
    manifest: ManifestSummary;
  }[];
}

export type ContentUploadsApi = AssetsApi;
