import { fail } from '@new-cms/cms/platform/contracts';
import { beforeDelete, afterDelete } from '../hooks/delete.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireRevision,
} from '../runtime.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

async function purgeInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; revision: number },
): Promise<{ id: string; purged: true }> {
  await state.tx.query(
    "SELECT id FROM content_jobs WHERE document_id=$1 AND status IN('queued','running') ORDER BY id FOR UPDATE",
    [input.id],
  );
  const document = await ensureVisible(state, {
    runtime: input.runtime,
    id: input.id,
    trashed: true,
    lock: true,
  });
  requireRevision(document, input.revision);
  if (!document.trashedAt) fail('invalid_input');
  const retained = await state.tx.query(
    "SELECT 1 WHERE $1::timestamptz+$2*interval '1 millisecond'>clock_timestamp()",
    [document.trashedAt, input.runtime.workPolicy.trashRetentionMs],
  );
  if (retained.rowCount !== 0) fail('resource_in_use');
  const references = await input.runtime.store.inboundReferences(state.tx, {
    collection: state.collection.key,
    id: input.id,
  });
  if (references.some((reference) => reference.sourceDocumentId !== input.id))
    fail('resource_in_use');
  const jobs = await state.tx.query(
    "SELECT 1 FROM content_jobs WHERE document_id=$1 AND status IN('queued','running') LIMIT 1",
    [input.id],
  );
  if (jobs.rowCount !== 0) fail('resource_in_use');
  if (await input.runtime.assets?.hasPendingWork(state.tx, { documentId: input.id }))
    fail('resource_in_use');
  const data = await beforeDelete(state, { runtime: input.runtime, document });
  await input.runtime.assets?.releaseDocument(state.tx, { documentId: input.id });
  await input.runtime.store.purgeDocument(state.tx, {
    collection: state.collection.key,
    id: input.id,
  });
  await auditContent(state, { runtime: input.runtime, id: input.id, detail: { kind: 'purged' } });
  await afterDelete(state, { runtime: input.runtime, documentId: input.id, data });
  return { id: input.id, purged: true };
}

async function purgeDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.purge'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'documents.purge', collection: input.collection },
    (state) =>
      idempotentReference(state, { runtime, input }, () =>
        purgeInTransaction(state, { runtime, id: input.id, revision: input.revision }),
      ),
  );
}

export function createPurgeApi(runtime: ContentRuntime) {
  return { purgeDocument: (ctx: RequestContext, raw: unknown) => purgeDocument(runtime, ctx, raw) };
}
