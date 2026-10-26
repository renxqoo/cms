import type { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import type { Principal } from '@new-cms/cms/access';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { withIdempotency } from '@new-cms/cms/platform/idempotency';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { contentOperations } from './operations.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import { queryableFields } from './fields/policies.ts';
import { targetReadContext } from './queries/resolve-locale.ts';
import { assertWhereBudget } from './queries/parse-query.ts';
import type { CollectionDefinition, DocumentData, Where } from './definition.ts';
import type { ContentRuntime, ContentState } from './types.ts';
import type { DocumentRow, QueryInput } from './model.ts';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    fail('invalid_input', {
      fieldErrors: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return result.data;
}

export function resolveLocale(collection: CollectionDefinition, locale?: string): string {
  const resolved = locale ?? collection.locales.default;
  if (!collection.locales.supported.includes(resolved)) fail('invalid_input');
  return resolved;
}

export function collectionPredicate(state: Omit<ContentState, 'predicate'>): Where | undefined {
  const policy = state.collection.access?.[state.operationId];
  if (!policy) return undefined;
  const result = policy.run({
    actor: state.actor,
    operation: state.operationId,
    collectionKey: state.collection.key,
    locale: state.locale,
    mode: state.mode,
  });
  if (result === false) fail('forbidden');
  if (result === true) return undefined;
  if (result === null || typeof result !== 'object' || Array.isArray(result)) fail('invalid_input');
  return result;
}

interface RunnerInput {
  ctx: RequestContext;
  operationId: string;
  collection: string;
  locale?: string;
  mode?: 'editing' | 'published';
  fallbackOverride?: readonly string[];
}

async function authorizedState(
  runtime: ContentRuntime,
  tx: SqlExecutor,
  input: RunnerInput,
): Promise<ContentState> {
  const actor = await runtime.authorize(tx, input.ctx, input.operationId, {
    scopeKind: 'collection',
    collectionKey: input.collection,
  });
  if (!actor) fail('unauthenticated');
  const collection = await runtime.resolveCollection(tx, input.collection);
  const state: Omit<ContentState, 'predicate'> = {
    tx,
    ctx: input.ctx,
    actor,
    collection,
    operationId: input.operationId,
    locale: resolveLocale(collection, input.locale),
    mode: input.mode ?? 'editing',
    ...(input.fallbackOverride ? { fallbackOverride: input.fallbackOverride } : {}),
  };
  const predicate = collectionPredicate(state);
  if (
    predicate &&
    (input.operationId.startsWith('folders.') || input.operationId === 'collections.get')
  )
    fail('invalid_input');
  return { ...state, ...(predicate ? { predicate } : {}) };
}

export function createRunner(runtime: ContentRuntime) {
  return function run<T>(
    input: RunnerInput,
    work: (state: ContentState) => Promise<T>,
  ): Promise<T> {
    return securityTransaction(runtime.database, runtime.policy, {
      mode: 'shared',
      ...(input.ctx.signal ? { signal: input.ctx.signal } : {}),
      async work(tx) {
        const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
        const mutating =
          [...contentOperations, ...assetsOperations].find(
            (operation) => operation.id === input.operationId,
          )?.method !== 'GET';
        if (mutating) await lockContentMutation(executor, runtime);
        const state = await authorizedState(runtime, executor, input);
        const result = await work(state);
        if (mutating)
          await runtime.validateAfterMutation?.(executor, {
            collection: state.collection.key,
            operationId: input.operationId,
          });
        if (
          result !== undefined &&
          Buffer.byteLength(JSON.stringify(result)) > runtime.limits.maxResponseBytes
        )
          fail('capacity_exceeded');
        return result;
      },
    });
  };
}

export function queryDefaults(state: ContentState, runtime: ContentRuntime): QueryInput {
  return {
    page: 1,
    pageSize: runtime.limits.defaultPageSize,
    ...targetReadContext({
      collection: state.collection,
      locale: state.locale,
      ...(state.fallbackOverride ? { fallback: state.fallbackOverride } : {}),
    }),
    mode: state.mode,
  };
}

export async function ensureVisible(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; trashed?: boolean; lock?: boolean },
): Promise<DocumentRow> {
  const document = await input.runtime.store.readDocument(state.tx, {
    collection: state.collection.key,
    locale: state.locale,
    id: input.id,
    ...(input.lock ? { lock: true } : {}),
  });
  if (document.trashedAt !== null && input.trashed !== true) fail('not_found');
  if (state.mode === 'published' && document.publishedVersionId === null) fail('not_found');
  if (state.predicate) {
    const page = await input.runtime.store.queryDocuments(state.tx, {
      collection: state.collection.key,
      query: {
        ...queryDefaults(state, input.runtime),
        pageSize: 1,
        trashed: document.trashedAt !== null,
        where: { field: 'id', operator: 'eq', value: document.id },
        policy: state.predicate,
      },
      ...(await policyRelations(state, input.runtime)),
      limits: input.runtime.limits,
    });
    if (page.rows.length === 0) fail('not_found');
  }
  return document;
}

export function requireRevision(document: DocumentRow, revision: number): void {
  if (document.revision !== revision) fail('version_conflict');
}

export function policyContext(state: ContentState, data?: DocumentData) {
  return {
    actor: state.actor,
    operation: state.operationId,
    collectionKey: state.collection.key,
    locale: state.locale,
    mode: state.mode,
    ...(data ? { data } : {}),
  };
}

export function permittedQueryFields(state: ContentState): readonly string[] {
  return queryableFields({ collection: state.collection, context: policyContext(state) });
}

export function auditContent(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; detail: unknown },
) {
  return appendAudit(
    state.tx,
    {
      actorKind: 'admin',
      actorId: state.actor.id,
      operationId: state.operationId,
      targetType: `content:${state.collection.key}`,
      targetId: input.id,
      requestId: state.ctx.requestId,
      detail: input.detail,
    },
    input.runtime.policy,
  );
}

export function idempotentReference<T>(
  state: ContentState,
  input: { runtime: ContentRuntime; input: unknown },
  work: () => Promise<T>,
): Promise<T> {
  return withIdempotency(
    state.tx,
    {
      actor: actorReference(state.actor),
      operationId: state.operationId,
      scope: { scopeKind: 'collection', collectionKey: state.collection.key },
      key: state.ctx.idempotencyKey,
      input: {
        collection: state.collection.key,
        mode: state.mode,
        locale: state.locale,
        input: input.input,
      },
      ttlMs: input.runtime.policy.idempotencyTtlMs,
    },
    work,
  );
}

export async function requireAdditionalOperation(
  state: ContentState,
  input: { runtime: ContentRuntime; operationId: string; id: string; trashed?: boolean },
): Promise<ContentState> {
  const actor = await authorizeStateOperation(state, {
    runtime: input.runtime,
    operationId: input.operationId,
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  const base = { ...state, operationId: input.operationId, actor };
  const predicate = collectionPredicate(base);
  const { predicate: _old, ...withoutPredicate } = base;
  const next = { ...withoutPredicate, ...(predicate ? { predicate } : {}) };
  await ensureVisible(next, {
    runtime: input.runtime,
    id: input.id,
    ...(input.trashed ? { trashed: true } : {}),
  });
  return next;
}

export function authorizeStateOperation(
  state: ContentState,
  input: { runtime: ContentRuntime; operationId: string; collection: string },
): Promise<Principal | null> {
  const scope = { scopeKind: 'collection' as const, collectionKey: input.collection };
  return state.actorAuthorization
    ? input.runtime.authorizeActor(state.tx, {
        actor: actorReference(state.actor),
        operationId: input.operationId,
        scope,
      })
    : input.runtime.authorize(state.tx, state.ctx, input.operationId, scope);
}

export function budgetedExecutor(tx: SqlExecutor, maximum: number): SqlExecutor {
  let used = 0;
  return {
    query(text, values) {
      used += 1;
      if (used > maximum) fail('capacity_exceeded');
      return tx.query(text, values);
    },
  };
}

export function lockContentMutation(tx: SqlExecutor, runtime: ContentRuntime): Promise<unknown> {
  return tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [runtime.workPolicy.resourceLockKey]);
}

export function policyUsesRelations(state: ContentState, runtime: ContentRuntime): boolean {
  if (!state.predicate) return false;
  assertWhereBudget(state.predicate, runtime.limits);
  const paths = runtime.mapping
    .get(state.collection.key)
    .flat.filter(({ field }) => field.type === 'relationship' || field.type === 'upload')
    .map(({ path }) => `${path}.`);
  const nodes = [state.predicate];
  for (const node of nodes) {
    if ('and' in node) nodes.push(...node.and);
    else if ('or' in node) nodes.push(...node.or);
    else if (paths.some((path) => node.field.startsWith(path))) return true;
  }
  return false;
}

export async function policyRelations(state: ContentState, runtime: ContentRuntime) {
  return policyUsesRelations(state, runtime) ? runtime.resolveRelationScopes(state) : {};
}
import { actorReference } from '@new-cms/cms/access';
