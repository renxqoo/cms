import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { Where } from '../definition.ts';
import type { EditorLease } from './contracts.ts';

export interface LeaseRow {
  actor_id: string;
  delegation_id: string | null;
  display_name: string | null;
  editor_id: string;
  locale: string;
  generation: number;
  expires_at: Date;
  active: boolean;
}

export async function readLease(state: ContentState, id: string): Promise<LeaseRow | undefined> {
  const result = await state.tx.query<LeaseRow>(
    'SELECT actor_id,delegation_id,display_name,editor_id,locale,generation,expires_at,expires_at>clock_timestamp() AS active FROM content_document_leases WHERE document_id=$1',
    [id],
  );
  return result.rows[0];
}

async function ownerPredicate(
  state: ContentState,
  runtime: ContentRuntime,
  lease: LeaseRow,
): Promise<ContentState | null> {
  try {
    const actor = await runtime.authorizeActor(state.tx, {
      actor: { id: lease.actor_id, delegationId: lease.delegation_id },
      operationId: 'documents.update',
      scope: { scopeKind: 'collection', collectionKey: state.collection.key },
    });
    const { predicate: _old, ...base } = state;
    const owner = {
      ...base,
      actor,
      operationId: 'documents.update',
      actorAuthorization: true,
      locale: lease.locale,
      mode: 'editing' as const,
    };
    const predicate = await runtime.evaluateCollectionPolicy(owner);
    return { ...owner, ...(predicate ? { predicate } : {}) };
  } catch (error) {
    if (
      error instanceof CmsError &&
      ['unauthenticated', 'forbidden', 'endpoint_unbound', 'not_found'].includes(error.code)
    )
      return null;
    throw error;
  }
}

export async function activeLease(
  state: ContentState,
  runtime: ContentRuntime,
  id: string,
): Promise<LeaseRow | undefined> {
  const lease = await readLease(state, id);
  if (!lease?.active) return undefined;
  const owner = await ownerPredicate(state, runtime, lease);
  if (!owner) return undefined;
  if (!owner.predicate) return lease;
  const predicate: Where = owner.predicate;
  const page = await runtime.store.queryDocuments(state.tx, {
    collection: state.collection.key,
    query: {
      page: 1,
      pageSize: 1,
      locale: owner.locale,
      fallback: [],
      mode: 'editing',
      where: { field: 'id', operator: 'eq', value: id },
      policy: predicate,
    },
    ...(await runtime.resolveRelationScopes(owner)),
    limits: runtime.limits,
  });
  return page.rows.length === 0 ? undefined : lease;
}

export function leaseView(
  state: ContentState,
  lease: LeaseRow | undefined,
  editorId?: string,
): EditorLease {
  const settings = state.collection.lockDocuments;
  return {
    enabled: Boolean(settings),
    owned:
      lease !== undefined &&
      ownsLease(state, lease) &&
      lease.editor_id === editorId &&
      lease.locale === state.locale,
    durationMs: settings ? settings.durationMs : null,
    heartbeatMs: settings ? settings.heartbeatMs : null,
    lease: lease
      ? {
          actorId: lease.actor_id,
          displayName: lease.display_name,
          generation: lease.generation,
          expiresAt: lease.expires_at.toISOString(),
        }
      : null,
  };
}

const mutations = new Set([
  'documents.copyLocale',
  'documents.renameFile',
  'documents.update',
  'documents.autosave',
  'documents.publish',
  'documents.unpublish',
  'documents.archive',
  'documents.restoreTrash',
  'documents.purge',
  'versions.restore',
]);

export async function assertEditorLease(
  state: ContentState,
  runtime: ContentRuntime,
  id: string,
): Promise<void> {
  if (!state.collection.lockDocuments || !mutations.has(state.operationId)) return;
  const lease = await activeLease(state, runtime, id);
  if (!lease) return;
  if (
    ownsLease(state, lease) &&
    (state.ctx.editorSessionId === lease.editor_id || state.backgroundWork === true)
  )
    return;
  fail('document_locked');
}

export function ownsLease(state: ContentState, lease: LeaseRow): boolean {
  return (
    lease.actor_id === state.actor.id &&
    lease.delegation_id === (state.actor.delegation?.id ?? null)
  );
}
