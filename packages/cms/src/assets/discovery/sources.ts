export interface DiscoveryRelation {
  sql: string;
  values: unknown[];
}

export interface AssetDiscoverySources {
  jobs: DiscoveryRelation;
  uploads: DiscoveryRelation;
  fileBindings: DiscoveryRelation;
}

export function assetDiscoverySources(input: {
  actorId: string;
  collectionKey: string;
}): AssetDiscoverySources {
  return {
    jobs: {
      sql: `SELECT j.id,j.collection_key AS "collection",j.action,j.status,j.attempts,j.failure_code AS "failureCode",j.upload_id AS "uploadId",j.document_id AS "documentId",j.created_at AS "createdAt",j.finished_at AS "finishedAt",u.authorization_locale AS "authorizationLocale",u.purpose,u.document_id AS "uploadDocumentId",u.expected_revision AS "uploadRevision",u.bound_document_id AS "boundDocumentId",u.bound_revision_id AS "boundRevisionId"
      FROM asset_jobs j JOIN asset_uploads u ON u.id=j.upload_id
      WHERE j.actor_id=$1 AND j.collection_key=$2 AND u.actor_id=$1 AND u.collection_key=$2`,
      values: [input.actorId, input.collectionKey],
    },
    uploads: {
      sql: `SELECT u.authorization_locale AS "authorizationLocale",u.id,u.collection_key AS "collection",u.purpose,u.document_id AS "documentId",u.expected_revision AS revision,u.status,u.expires_at AS "expiresAt",u.failure_code AS "failureCode",u.job_id AS "jobId",u.filename,u.declared_type AS "declaredMimeType",u.declared_bytes::float8 AS "declaredBytes",u.created_at AS "createdAt",u.bound_document_id AS "boundDocumentId",u.bound_revision_id AS "boundRevisionId"
      FROM asset_uploads u WHERE u.actor_id=$1 AND u.collection_key=$2`,
      values: [input.actorId, input.collectionKey],
    },
    fileBindings: {
      sql: `SELECT DISTINCT r.document_id AS "documentId",r.revision_id AS "revisionId"
      FROM asset_references r JOIN asset_manifests m ON m.id=r.manifest_id
      WHERE r.source_path='$file' AND r.document_id=r.media_document_id AND r.collection_key=$1 AND r.media_collection_key=$1 AND m.state='ready'`,
      values: [input.collectionKey],
    },
  };
}
