import type { UploadSessionView } from '@new-cms/cms/assets';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
export type JobAction = 'batch' | 'publication' | 'extension' | 'process' | 'reprocess';

export interface ContentJobSummary {
  kind: 'content';
  id: string;
  collection: string;
  action: 'batch' | 'publication' | 'extension';
  status: JobStatus;
  executeAt: string;
  createdAt: string;
  finishedAt: string | null;
  documentId: string | null;
  expectedRevision: number | null;
  requestedVersionId: string | null;
  publicationAction?: 'publish' | 'unpublish';
  locale?: string;
  total: number;
  succeeded: number;
  failed: number;
}

export interface AssetJobSummary {
  kind: 'asset';
  id: string;
  collection: string;
  action: 'process' | 'reprocess';
  status: Exclude<JobStatus, 'partial'>;
  attempts: number;
  failureCode: string | null;
  uploadId: string;
  documentId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export type JobSummary = ContentJobSummary | AssetJobSummary;

export type UploadSummary = Omit<UploadSessionView, 'manifest'>;

export interface DiscoveryPage<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
