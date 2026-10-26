import { appendAudit } from '@new-cms/cms/audit/composition';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { withIdempotency } from '@new-cms/cms/platform/idempotency';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { AccessRuntime, AuthorizedWork } from './types.ts';
import { createAuthorization } from './authorization.ts';
import { actorReference } from './authorization.ts';

function databaseFailure(error: unknown): never {
  if (error instanceof CmsError) throw error;
  if (error !== null && typeof error === 'object' && 'code' in error) {
    if (error.code === '23505') fail('identifier_taken');
    if (error.code === '23503') fail('resource_in_use');
  }
  throw error;
}

export function createRunner(runtime: AccessRuntime) {
  const authorize = createAuthorization(runtime);
  return function run<T>(
    input: { ctx: RequestContext; operationId: string; mode: 'shared' | 'exclusive' },
    work: (state: AuthorizedWork) => Promise<T>,
  ) {
    return securityTransaction(runtime.database, runtime.policy, {
      mode: input.mode,
      ...(input.ctx.signal ? { signal: input.ctx.signal } : {}),
      async work(tx) {
        try {
          const actor = await authorize(tx, input.ctx, input.operationId);
          if (!actor) fail('unauthenticated');
          return await work({ tx, actor, ctx: input.ctx });
        } catch (error) {
          return databaseFailure(error);
        }
      },
    });
  };
}

export function auditChange(
  state: AuthorizedWork,
  input: { operationId: string; targetType: string; targetId: string; detail: unknown },
  runtime: AccessRuntime,
) {
  return appendAudit(
    state.tx,
    {
      ...input,
      detail: safeAuditDetail(input.detail),
      actorKind: 'admin',
      actorId: state.actor.id,
      requestId: state.ctx.requestId,
    },
    runtime.policy,
  );
}

export function idempotent<T>(
  state: AuthorizedWork,
  input: { operationId: string; input: unknown; runtime: AccessRuntime },
  work: () => Promise<T>,
) {
  return withIdempotency(
    state.tx,
    {
      actor: actorReference(state.actor),
      operationId: input.operationId,
      key: state.ctx.idempotencyKey,
      input: input.input,
      ttlMs: input.runtime.policy.idempotencyTtlMs,
    },
    work,
  );
}

function safeAuditDetail(detail: unknown): unknown {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return detail;
  const entries = Object.entries(detail);
  const privateFields = new Set(['name', 'description', 'displayName']);
  const changedFields = entries.filter(([key]) => privateFields.has(key)).map(([key]) => key);
  if (changedFields.length === 0) return detail;
  return {
    ...Object.fromEntries<unknown>(entries.filter(([key]) => !privateFields.has(key))),
    changedFields,
  };
}
