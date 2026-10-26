import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import { authorizedManifestBrand } from '../types.ts';
import type {
  AssetsParticipants,
  AssetsOptions,
  AuthorizedManifest,
  BindAssetInput,
  UploadRow,
} from '../types.ts';
import { createBindingDownloader } from '../manifests/binding-download.ts';
import { lockManifest, readManifest, readManifests } from '../manifests/read-manifest.ts';

interface BindingRow {
  revision_id: string;
  id: string;
  source_path: string;
  media_document_id: string;
  media_collection_key: string;
  manifest_id: string;
}

function validateUpload(
  row: UploadRow | undefined,
  input: BindAssetInput,
): asserts row is UploadRow {
  if (row?.status !== 'ready' || !row.manifest_id || !row.is_active) fail('invalid_input');
  if (row.actor_id !== input.actorId || row.collection_key !== input.collectionKey)
    fail('forbidden');
  if (
    row.purpose === 'replace' &&
    (row.document_id !== input.documentId || row.expected_revision !== input.expectedRevision)
  )
    fail('version_conflict');
  if (row.purpose === 'create' && input.expectedRevision !== undefined) fail('invalid_input');
  if (input.sourcePath !== '$file') fail('invalid_input');
}

async function describeBinding(tx: SqlExecutor, input: { bindingId: string }) {
  const result = await tx.query<BindingRow & { document_id: string; collection_key: string }>(
    'SELECT * FROM asset_references WHERE id=$1',
    [input.bindingId],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  return {
    revisionId: row.revision_id,
    documentId: row.document_id,
    collectionKey: row.collection_key,
    sourcePath: row.source_path,
    mediaDocumentId: row.media_document_id,
    mediaCollectionKey: row.media_collection_key,
  };
}

export function createParticipants(
  runtime: AssetsOptions & { signal: AbortSignal },
): AssetsParticipants {
  const { retentionMs } = runtime.limits;
  const grants = new WeakMap<AuthorizedManifest, SqlExecutor>();
  return {
    openBinding: createBindingDownloader(runtime),
    describeBinding,
    readManifest,
    listRevisionBindings,
    async listBindings(tx, input) {
      return (await listRevisionBindings(tx, { revisionIds: [input.revisionId] })).map(
        ({ revisionId: _revisionId, ...binding }) => binding,
      );
    },
    releaseDocument: (tx, input) =>
      releaseReferences(tx, { documentId: input.documentId, retentionMs }),
    async hasPendingWork(tx, input) {
      const result = await tx.query(
        `SELECT 1 FROM asset_uploads WHERE document_id=$1 AND status IN('pending','uploading','processing','ready') LIMIT 1`,
        [input.documentId],
      );
      return result.rowCount !== 0;
    },
    bind: (tx, input) => bind(tx, { input, grants, runtime }),
    releaseRevision: (tx, input) =>
      releaseReferences(tx, { revisionId: input.revisionId, retentionMs }),
    async resolveRevisionMedia(tx, input) {
      const row = await source(tx, input);
      if (row.media_document_id !== input.mediaDocumentId) fail('not_found');
      return authorizeBinding(tx, row, grants);
    },
    async resolveBinding(tx, input) {
      const row = await source(tx, input);
      return {
        sourcePath: row.source_path,
        mediaDocumentId: row.media_document_id,
        mediaCollectionKey: row.media_collection_key,
        authorizedManifest: authorizeBinding(tx, row, grants),
      };
    },
  };
}

function authorizeBinding(
  tx: SqlExecutor,
  row: BindingRow,
  grants: WeakMap<AuthorizedManifest, SqlExecutor>,
): AuthorizedManifest {
  const grant: AuthorizedManifest = {
    manifestId: row.manifest_id,
    mediaDocumentId: row.media_document_id,
    mediaCollectionKey: row.media_collection_key,
    [authorizedManifestBrand]: true,
  };
  grants.set(grant, tx);
  return grant;
}

async function listRevisionBindings(tx: SqlExecutor, input: { revisionIds: readonly string[] }) {
  const result = await tx.query<BindingRow>(
    'SELECT * FROM asset_references WHERE revision_id=ANY($1::uuid[]) ORDER BY revision_id,source_path',
    [input.revisionIds],
  );
  const manifests = await readManifests(tx, {
    manifestIds: [...new Set(result.rows.map((row) => row.manifest_id))],
  });
  return result.rows.map((row) => {
    const manifest = manifests.get(row.manifest_id);
    if (!manifest) fail('not_found');
    return {
      revisionId: row.revision_id,
      bindingId: row.id,
      sourcePath: row.source_path,
      mediaDocumentId: row.media_document_id,
      mediaCollectionKey: row.media_collection_key,
      manifest,
    };
  });
}

async function bindingTarget(
  tx: SqlExecutor,
  state: { input: BindAssetInput; runtime: Pick<AssetsOptions, 'authorizeActor'> },
) {
  const { input, runtime } = state;
  if (!input.uploadId) fail('invalid_input');
  const result = await tx.query<UploadRow>(
    'SELECT *,expires_at>clock_timestamp() AS is_active,lease_until>clock_timestamp() AS lease_active FROM asset_uploads WHERE id=$1 FOR UPDATE',
    [input.uploadId],
  );
  const [row] = result.rows;
  validateUpload(row, input);
  if (row.delegation_id !== null)
    await runtime.authorizeActor(tx, {
      actor: { id: row.actor_id, delegationId: row.delegation_id },
      operationId: input.operationId,
      scope: { scopeKind: 'collection', collectionKey: input.collectionKey },
    });
  if (!row.manifest_id) fail('invalid_input');
  await tx.query(
    "UPDATE asset_uploads SET status='consumed',bound_document_id=$2,bound_revision_id=$3 WHERE id=$1",
    [row.id, input.documentId, input.revisionId],
  );
  return {
    manifestId: row.manifest_id,
    mediaDocumentId: input.documentId,
    mediaCollectionKey: input.collectionKey,
  };
}

async function bind(
  tx: SqlExecutor,
  state: {
    input: BindAssetInput;
    grants: WeakMap<AuthorizedManifest, SqlExecutor>;
    runtime: Pick<AssetsOptions, 'authorizeActor'>;
  },
) {
  const { input, grants } = state;
  if (Boolean(input.uploadId) === Boolean(input.authorizedManifest)) fail('invalid_input');
  const grant = input.authorizedManifest;
  if (grant && grants.get(grant) !== tx) fail('forbidden');
  const target = grant ?? (await bindingTarget(tx, { input, runtime: state.runtime }));
  const mediaDocumentId = input.sourcePath === '$file' ? input.documentId : target.mediaDocumentId;
  const mediaCollectionKey =
    input.sourcePath === '$file' ? input.collectionKey : target.mediaCollectionKey;
  await lockManifest(tx, target.manifestId);
  const bindingId = randomUUID();
  await tx.query(
    `INSERT INTO asset_references(id,revision_id,document_id,collection_key,source_path,media_document_id,media_collection_key,manifest_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      bindingId,
      input.revisionId,
      input.documentId,
      input.collectionKey,
      input.sourcePath,
      mediaDocumentId,
      mediaCollectionKey,
      target.manifestId,
    ],
  );
  return { bindingId, manifest: await readManifest(tx, { manifestId: target.manifestId }) };
}

async function releaseReferences(
  tx: SqlExecutor,
  input: { revisionId?: string; documentId?: string; retentionMs: number },
): Promise<void> {
  const condition = input.revisionId ? 'revision_id=$1' : 'document_id=$1';
  const id = input.revisionId ?? input.documentId;
  const refs = await tx.query<{ manifest_id: string }>(
    `SELECT DISTINCT manifest_id FROM asset_references WHERE ${condition} ORDER BY manifest_id`,
    [id],
  );
  const manifests = refs.rows.map((row) => row.manifest_id);
  await tx.query('SELECT id FROM asset_manifests WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
    manifests,
  ]);
  await tx.query(
    `UPDATE asset_manifests SET retain_until=GREATEST(retain_until,clock_timestamp()+$2*interval '1 millisecond') WHERE id=ANY($1::uuid[])`,
    [manifests, input.retentionMs],
  );
  await tx.query(
    `UPDATE asset_objects SET retain_until=GREATEST(retain_until,clock_timestamp()+$2*interval '1 millisecond')
     WHERE id IN(SELECT object_id FROM asset_manifest_objects WHERE manifest_id=ANY($1::uuid[]))`,
    [manifests, input.retentionMs],
  );
  await tx.query(`DELETE FROM asset_references WHERE ${condition}`, [id]);
}

async function source(
  tx: SqlExecutor,
  input: { revisionId: string; sourcePath?: string; bindingId?: string },
) {
  const result = await tx.query<BindingRow>(
    `SELECT * FROM asset_references WHERE revision_id=$1 AND ($2::text IS NULL OR source_path=$2) AND ($3::uuid IS NULL OR id=$3)`,
    [input.revisionId, input.sourcePath ?? null, input.bindingId ?? null],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  await lockManifest(tx, row.manifest_id);
  return row;
}
