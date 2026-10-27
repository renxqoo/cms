import type { SqlExecutor } from '@new-cms/database/client';
import type { UploadRow, UploadSessionView } from '../types.ts';
import { readManifest } from '../manifests/read-manifest.ts';

export async function sessionView(tx: SqlExecutor, row: UploadRow): Promise<UploadSessionView> {
  return {
    locale: row.authorization_locale,
    id: row.id,
    filename: row.filename,
    declaredMimeType: row.declared_type,
    declaredBytes: row.declared_bytes,
    createdAt: row.created_at.toISOString(),
    collection: row.collection_key,
    purpose: row.purpose,
    documentId: row.document_id,
    revision: row.expected_revision,
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
    failureCode: row.failure_code,
    manifest: row.manifest_id ? await readManifest(tx, { manifestId: row.manifest_id }) : null,
    jobId: row.job_id,
  };
}
