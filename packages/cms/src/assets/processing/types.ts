import type { ImageRecipe, UploadRow } from '../types.ts';

export interface JobRow {
  id: string;
  actor_id: string;
  delegation_id: string | null;
  collection_key: string;
  action: 'process' | 'reprocess';
  upload_id: string;
  document_id: string | null;
  expected_revision: number | null;
  recipe: ImageRecipe;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  owner: string | null;
  generation: number;
  lease_until: Date | null;
  attempts: number;
  failure_code: string | null;
  manifest_id: string | null;
}

export interface ClaimedJob {
  job: JobRow;
  upload: UploadRow;
  original: ObjectRow;
}

export interface ObjectRow {
  id: string;
  object_key: string;
  bytes: number;
  digest: string;
  mime_type: string;
  state: string;
}

export interface CandidateObject {
  id: string;
  key: string;
  name: string;
  bytes: number;
  digest: string;
  mimeType: string;
  width: number | null;
  height: number | null;
}
