import type { ApiResult } from '../../api/result';
import type { AssetManifest } from '../../contracts/assets';
import type { CollectionEditor } from '../../contracts/editor';

export type AssetBudget = NonNullable<CollectionEditor['upload']>;
export type AssetWriteKind = 'replace' | 'reprocess';

export interface AssetWriteLease {
  revision: number;
  signal: AbortSignal;
  consumeUpload: (uploadId: string, signal: AbortSignal) => Promise<ApiResult<unknown>>;
  refresh: (signal: AbortSignal) => Promise<ApiResult<unknown>>;
  finish: (outcome: 'confirmed' | 'blocked') => void;
}

export interface AssetDocumentControlsProps {
  collection: string;
  documentId: string;
  versionId: string;
  revision: number;
  manifest: AssetManifest | null;
  budget: AssetBudget;
  busy: boolean;
  readOnly?: boolean;
  begin: (kind: AssetWriteKind) => AssetWriteLease | null;
}

interface FileTarget {
  collection: string;
  id: string;
  versionId?: string;
  mode: 'editing' | 'published';
  variant?: string;
}

export type AssetPreviewTarget =
  | (FileTarget & { kind: 'document' })
  | (FileTarget & { kind: 'binding'; bindingId: string });

export interface AssetPreviewProps {
  target: AssetPreviewTarget;
  label: string;
  manifest?: AssetManifest;
}
