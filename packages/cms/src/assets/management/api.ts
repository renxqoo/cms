import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { withIdempotency } from '@new-cms/cms/platform/idempotency';
import type { AssetsOptions } from '../types.ts';
import type { AssetState } from '../runtime.ts';
import { lockAssets, audit } from '../runtime.ts';
import { assetsInputSchemas } from '../input-schemas.ts';
import { parse } from '../validation.ts';
import { cleanupEntry, cleanupPage } from './query.ts';
import { resetBlockedObjects } from './retry-object.ts';
import type { CleanupRetryReceipt } from './contracts.ts';

function run<T>(
  runtime: AssetsOptions,
  input: {
    ctx: RequestContext;
    operationId: string;
    mutation?: boolean;
  },
  work: (state: AssetState) => Promise<T>,
) {
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    ...(input.ctx.signal ? { signal: input.ctx.signal } : {}),
    async work(tx) {
      if (input.mutation) await lockAssets(tx, runtime);
      const actor = await runtime.authorize(tx, input.ctx, input.operationId, {
        scopeKind: 'global',
        collectionKey: null,
      });
      if (!actor) fail('unauthenticated');
      return work({ tx, actor, ctx: input.ctx, operationId: input.operationId });
    },
  });
}

async function retryCleanup(
  runtime: AssetsOptions,
  ctx: RequestContext,
  raw: unknown,
): Promise<CleanupRetryReceipt> {
  const input = parse(assetsInputSchemas(runtime.policy)['assets.retryCleanup'], raw);
  return run(runtime, { ctx, operationId: 'assets.retryCleanup', mutation: true }, (state) =>
    withIdempotency(
      state.tx,
      {
        actorId: state.actor.id,
        operationId: state.operationId,
        key: ctx.idempotencyKey,
        input,
        ttlMs: runtime.policy.idempotencyTtlMs,
      },
      async () => {
        const current = await cleanupEntry(state.tx, input.id);
        if (!current.blocked) fail('version_conflict');
        const changed = await resetBlockedObjects(state.tx, { id: input.id, limit: 1 });
        if (changed.rowCount !== 1) fail('version_conflict');
        await audit(state.tx, {
          runtime,
          actorId: state.actor.id,
          operationId: state.operationId,
          targetId: input.id,
          requestId: ctx.requestId,
          detail: { kind: 'cleanupRetryAccepted' },
        });
        return { id: input.id, accepted: true, location: `/v1/asset-cleanups/${input.id}` };
      },
    ),
  );
}

export function createCleanupApi(runtime: AssetsOptions) {
  return {
    async listCleanup(ctx: RequestContext, raw: unknown) {
      const input = parse(assetsInputSchemas(runtime.policy)['assets.listCleanup'], raw);
      return run(runtime, { ctx, operationId: 'assets.listCleanup' }, (state) =>
        cleanupPage(state.tx, input),
      );
    },
    async getCleanup(ctx: RequestContext, raw: unknown) {
      const input = parse(assetsInputSchemas(runtime.policy)['assets.getCleanup'], raw);
      return run(runtime, { ctx, operationId: 'assets.getCleanup' }, (state) =>
        cleanupEntry(state.tx, input.id),
      );
    },
    retryCleanup: (ctx: RequestContext, raw: unknown) => retryCleanup(runtime, ctx, raw),
  };
}
