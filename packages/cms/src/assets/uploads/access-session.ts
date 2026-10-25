import { fail } from '@new-cms/cms/platform/contracts';
import type { AssetsOptions, UploadRow } from '../types.ts';
import type { AssetState } from '../runtime.ts';
import { session } from '../runtime.ts';

export function authorizeSession(
  runtime: AssetsOptions,
  state: AssetState,
  input: { row: UploadRow; forMutation?: boolean },
) {
  const { row } = input;
  const documentId = row.bound_document_id ?? row.document_id;
  if (!input.forMutation && documentId)
    return runtime.authorizeContent(state.tx, {
      operationId: state.operationId,
      actor: state.actor,
      action: 'download',
      collectionKey: row.collection_key,
      documentId,
      ...(row.bound_revision_id ? { versionId: row.bound_revision_id } : {}),
    });
  return runtime.authorizeContent(state.tx, {
    operationId: state.operationId,
    actor: state.actor,
    action: row.purpose === 'replace' ? 'replace' : 'upload',
    collectionKey: row.collection_key,
    ...(row.document_id ? { documentId: row.document_id } : {}),
    ...(row.expected_revision ? { revision: row.expected_revision } : {}),
  });
}

export async function ownedSession(
  runtime: AssetsOptions,
  state: AssetState,
  input: {
    collection: string;
    uploadId: string;
    forMutation?: boolean;
    lockJob?: boolean;
  },
) {
  const query = { id: input.uploadId, collectionKey: input.collection, actorId: state.actor.id };
  const before = await session(state.tx, query);
  await authorizeSession(runtime, state, {
    row: before,
    ...(input.forMutation ? { forMutation: true } : {}),
  });
  if (input.lockJob && before.job_id)
    await state.tx.query('SELECT id FROM asset_jobs WHERE id=$1 FOR UPDATE', [before.job_id]);
  const row = await session(state.tx, { ...query, lock: true });
  const sourceDocument = before.bound_document_id ?? before.document_id;
  const currentDocument = row.bound_document_id ?? row.document_id;
  if (sourceDocument !== currentDocument) fail('version_conflict');
  if (!input.forMutation && row.bound_revision_id !== before.bound_revision_id)
    await authorizeSession(runtime, state, { row });
  return row;
}
