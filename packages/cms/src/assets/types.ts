import type { Principal, AccessAuthorization, AccessActorAuthorization } from '@new-cms/cms/access';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import type { AssetDownload } from './manifests/download.ts';

export interface AssetLimits {
  maxUploadBytes: number;
  maxOutputBytes: number;
  maxPixels: number;
  maxFrames: number;
  maxWidth: number;
  maxHeight: number;
  uploadConcurrency: number;
  uploadQueueSize: number;
  uploadQueueTimeoutMs: number;
  uploadTimeoutMs: number;
  processingTimeoutMs: number;
  sessionTtlMs: number;
  retentionMs: number;
  leaseMs: number;
  jobAttempts: number;
  maintenanceBatchSize: number;
  maxVariants: number;
  maxActiveSessionsPerActor: number;
  maxActiveBytesPerActor: number;
  maxActiveSessions: number;
  maxActiveBytes: number;
}

export interface VariantRecipe {
  name: string;
  width: number;
  height: number;
  fit: 'cover' | 'contain' | 'inside';
  format: 'jpeg' | 'png' | 'webp';
  quality: number;
}

export interface ImageRecipe {
  variants: readonly VariantRecipe[];
  focalPoint?: { x: number; y: number } | undefined;
  crop?: { left: number; top: number; width: number; height: number } | undefined;
}

export interface UploadSettings {
  mimeTypes: readonly string[];
  maxBytes: number;
  recipe: ImageRecipe;
}

export interface StoredObject {
  key: string;
  bytes: number;
  digest: string;
  mimeType: string;
}

export interface StorageDriver {
  readonly capabilities: {
    shared: boolean;
    directUpload: false;
    multipart: false;
    writeSettleMs: number | null;
  };
  put(input: {
    key: string;
    bytes: Uint8Array;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<void>;
  read(input: { key: string; signal: AbortSignal }): Promise<ReadableStream<Uint8Array>>;
  remove(input: { key: string; signal: AbortSignal }): Promise<void>;
  verify(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

export interface ProcessedImage {
  width: number;
  height: number;
  orientation: number;
  variants: { name: string; bytes: Uint8Array; mimeType: string; width: number; height: number }[];
}

export interface ImageProcessor {
  readonly version: string;
  process(input: {
    bytes: Uint8Array;
    mimeType: string;
    recipe: ImageRecipe;
    limits: AssetLimits;
    signal: AbortSignal;
  }): Promise<ProcessedImage>;
  close(): Promise<void>;
}

export interface ContentAuthorizationInput {
  operationId: string;
  reauthorizeOnly?: boolean;
  actor: Principal;
  action: 'upload' | 'replace' | 'download' | 'reprocess';
  collectionKey: string;
  documentId?: string;
  revision?: number;
  versionId?: string;
  mode?: 'editing' | 'published';
  bindingId?: string;
  sourcePath?: string;
}

export interface ContentAuthorization {
  upload: UploadSettings;
  documentId?: string;
  revision?: number;
  revisionId?: string;
  manifestId?: string;
}

export type ContentAuthorizer = (
  tx: SqlExecutor,
  input: ContentAuthorizationInput,
) => Promise<ContentAuthorization>;

export interface AssetsOptions {
  database: Database;
  policy: CmsPolicy;
  resourceLockKey: number;
  limits: AssetLimits;
  authorize: AccessAuthorization;
  authorizeActor: AccessActorAuthorization;
  commitProcessing: (
    tx: SqlExecutor,
    input: {
      actor: Principal;
      collectionKey: string;
      documentId: string;
      revision: number;
      uploadId: string;
      jobId: string;
    },
  ) => Promise<{ revisionId: string }>;
  authorizeContent: ContentAuthorizer;
  storage: StorageDriver;
  images: ImageProcessor;
}

export interface ManifestObject {
  name: string;
  bytes: number;
  digest: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}

export interface ManifestSummary {
  id: string;
  filename: string;
  mimeType: string;
  bytes: number;
  digest: string;
  width: number | null;
  height: number | null;
  orientation: number | null;
  processorVersion: string;
  recipe: ImageRecipe;
  objects: ManifestObject[];
}

export interface UploadSessionView {
  id: string;
  filename: string;
  declaredMimeType: string;
  declaredBytes: number;
  createdAt: string;
  collection: string;
  purpose: 'create' | 'replace';
  documentId: string | null;
  revision: number | null;
  status:
    | 'pending'
    | 'uploading'
    | 'processing'
    | 'ready'
    | 'consumed'
    | 'failed'
    | 'cancelled'
    | 'expired';
  expiresAt: string;
  failureCode: string | null;
  manifest: ManifestSummary | null;
  jobId: string | null;
}

export interface UploadRow {
  id: string;
  actor_id: string;
  delegation_id: string | null;
  collection_key: string;
  purpose: 'create' | 'replace';
  document_id: string | null;
  expected_revision: number | null;
  filename: string;
  declared_type: string;
  declared_bytes: number;
  settings: UploadSettings;
  status: UploadSessionView['status'];
  expires_at: Date;
  generation: number;
  lease_until: Date | null;
  manifest_id: string | null;
  failure_code: string | null;
  bound_document_id: string | null;
  bound_revision_id: string | null;
  original_object_id: string | null;
  job_id: string | null;
  created_at: Date;
  is_active: boolean;
  lease_active: boolean;
}

export interface AssetJobView {
  id: string;
  collection: string;
  action: 'process' | 'reprocess';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempts: number;
  failureCode: string | null;
  uploadId: string | null;
  manifest: ManifestSummary | null;
}

export const authorizedManifestBrand: unique symbol = Symbol('authorized-manifest');

export interface AuthorizedManifest {
  readonly manifestId: string;
  readonly mediaDocumentId: string;
  readonly mediaCollectionKey: string;
  readonly [authorizedManifestBrand]: true;
}

export interface BindAssetInput {
  operationId: string;
  actorId: string;
  collectionKey: string;
  documentId: string;
  revisionId: string;
  sourcePath: string;
  expectedRevision?: number;
  uploadId?: string;
  authorizedManifest?: AuthorizedManifest;
}

export interface AssetsParticipants {
  describeBinding(
    tx: SqlExecutor,
    input: { bindingId: string },
  ): Promise<{
    revisionId: string;
    documentId: string;
    collectionKey: string;
    sourcePath: string;
    mediaDocumentId: string;
    mediaCollectionKey: string;
  }>;
  openBinding(
    tx: SqlExecutor,
    input: { bindingId: string; signal?: AbortSignal },
  ): Promise<AssetDownload>;
  listRevisionBindings(
    tx: SqlExecutor,
    input: { revisionIds: readonly string[] },
  ): Promise<
    {
      revisionId: string;
      bindingId: string;
      sourcePath: string;
      mediaDocumentId: string;
      mediaCollectionKey: string;
      manifest: ManifestSummary;
    }[]
  >;
  releaseDocument(tx: SqlExecutor, input: { documentId: string }): Promise<void>;
  hasPendingWork(tx: SqlExecutor, input: { documentId: string }): Promise<boolean>;
  listBindings(
    tx: SqlExecutor,
    input: { revisionId: string },
  ): Promise<
    {
      bindingId: string;
      sourcePath: string;
      mediaDocumentId: string;
      mediaCollectionKey: string;
      manifest: ManifestSummary;
    }[]
  >;
  bind(
    tx: SqlExecutor,
    input: BindAssetInput,
  ): Promise<{ bindingId: string; manifest: ManifestSummary }>;
  releaseRevision(tx: SqlExecutor, input: { revisionId: string }): Promise<void>;
  readManifest(tx: SqlExecutor, input: { manifestId: string }): Promise<ManifestSummary>;
  resolveRevisionMedia(
    tx: SqlExecutor,
    input: {
      revisionId: string;
      sourcePath: string;
      mediaDocumentId: string;
    },
  ): Promise<AuthorizedManifest>;
  resolveBinding(
    tx: SqlExecutor,
    input: { revisionId: string; bindingId: string },
  ): Promise<{
    sourcePath: string;
    mediaDocumentId: string;
    mediaCollectionKey: string;
    authorizedManifest: AuthorizedManifest;
  }>;
}
