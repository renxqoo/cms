import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { auditContent, createRunner, ensureVisible, parse } from '../runtime.ts';
import { operationState, requireEditorDocument } from '../editor/context.ts';
import { activeLease, leaseView, readLease, ownsLease } from './store.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { EditorLease } from './contracts.ts';

async function documentContext(
  state: ContentState,
  runtime: ContentRuntime,
  input: { id: string; write: boolean; release?: true },
) {
  const document = await ensureVisible(state, {
    runtime,
    id: input.id,
    ...(input.release ? { trashed: true } : {}),
  });
  for (const operationId of input.write
    ? ['documents.get', 'documents.update']
    : ['documents.get']) {
    const reader = await operationState(state, { runtime, operationId, mode: 'editing' });
    if (input.release) await ensureVisible(reader, { runtime, id: input.id, trashed: true });
    else
      await requireEditorDocument(reader, { runtime, document, context: { relations: new Map() } });
  }
}
async function acquire(
  state: ContentState,
  runtime: ContentRuntime,
  input: { id: string; editorId: string; generation?: number | undefined },
): Promise<EditorLease> {
  const settings = state.collection.lockDocuments;
  if (!settings) return leaseView(state, undefined, input.editorId);
  const current = await activeLease(state, runtime, input.id);
  if (current && (!ownsLease(state, current) || current.editor_id !== input.editorId))
    return leaseView(state, current, input.editorId);
  const previous = await readLease(state, input.id);
  if (input.generation !== undefined && (!current || current.generation !== input.generation))
    return { ...leaseView(state, current, input.editorId), owned: false };
  const generation =
    current && current.locale === state.locale
      ? current.generation
      : (previous?.generation ?? 0) + 1;
  await state.tx.query(
    `INSERT INTO content_document_leases(document_id,actor_id,display_name,editor_id,locale,generation,expires_at,delegation_id)
     VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()+$7*interval '1 millisecond',$8)
     ON CONFLICT(document_id) DO UPDATE SET actor_id=excluded.actor_id,delegation_id=excluded.delegation_id,display_name=excluded.display_name,
     editor_id=excluded.editor_id,locale=excluded.locale,generation=excluded.generation,expires_at=excluded.expires_at`,
    [
      input.id,
      state.actor.id,
      state.actor.displayName,
      input.editorId,
      state.locale,
      generation,
      settings.durationMs,
      state.actor.delegation?.id ?? null,
    ],
  );
  if (!current)
    await auditContent(state, {
      runtime,
      id: input.id,
      detail: { kind: 'editorLeaseAcquired', generation },
    });
  return leaseView(state, await readLease(state, input.id), input.editorId);
}
function getEditorLease(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.getLock'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.getLock',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      await documentContext(state, runtime, { id: input.id, write: false });
      return leaseView(
        state,
        state.collection.lockDocuments ? await activeLease(state, runtime, input.id) : undefined,
        input.editorId,
      );
    },
  );
}
function acquireEditorLease(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.acquireLock'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.acquireLock',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      await documentContext(state, runtime, { id: input.id, write: true });
      return acquire(state, runtime, input);
    },
  );
}
function releaseEditorLease(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.releaseLock'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.releaseLock',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      await documentContext(state, runtime, { id: input.id, write: false, release: true });
      if (!state.collection.lockDocuments) return leaseView(state, undefined, input.editorId);
      const current = await readLease(state, input.id);
      if (
        current &&
        ownsLease(state, current) &&
        current.editor_id === input.editorId &&
        current.locale === state.locale &&
        current.generation === input.generation
      ) {
        await state.tx.query(
          'UPDATE content_document_leases SET expires_at=clock_timestamp(),generation=generation+1 WHERE document_id=$1',
          [input.id],
        );
        await auditContent(state, {
          runtime,
          id: input.id,
          detail: { kind: 'editorLeaseReleased', generation: current.generation },
        });
      }
      return leaseView(state, await activeLease(state, runtime, input.id), input.editorId);
    },
  );
}
function unlockDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.unlock'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.unlock',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      await documentContext(state, runtime, { id: input.id, write: true });
      const current = await activeLease(state, runtime, input.id);
      if (!state.collection.lockDocuments) fail('invalid_input');
      if (!current || current.generation !== input.generation) fail('version_conflict');
      await state.tx.query(
        'UPDATE content_document_leases SET expires_at=clock_timestamp() WHERE document_id=$1',
        [input.id],
      );
      await auditContent(state, {
        runtime,
        id: input.id,
        detail: {
          kind: 'editorLeaseTakenOver',
          previousActorId: current.actor_id,
          generation: current.generation,
        },
      });
      return acquire(state, runtime, { id: input.id, editorId: input.editorId });
    },
  );
}
export function createCollaborationApi(runtime: ContentRuntime) {
  return {
    getEditorLease: (ctx: RequestContext, raw: unknown) => getEditorLease(runtime, ctx, raw),
    acquireEditorLease: (ctx: RequestContext, raw: unknown) =>
      acquireEditorLease(runtime, ctx, raw),
    releaseEditorLease: (ctx: RequestContext, raw: unknown) =>
      releaseEditorLease(runtime, ctx, raw),
    unlockDocument: (ctx: RequestContext, raw: unknown) => unlockDocument(runtime, ctx, raw),
  };
}
