import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { collectionMetadata } from './fields/policies.ts';
import {
  budgetedExecutor,
  collectionPredicate,
  createRunner,
  parse,
  policyContext,
  resolveLocale,
} from './runtime.ts';
import { denied } from './documents/relation-scopes.ts';
import type { ContentRuntime, ContentState } from './types.ts';

export function metadata(state: ContentState, runtime: ContentRuntime) {
  return {
    ...collectionMetadata({ collection: state.collection, context: policyContext(state) }),
    behaviorHash: runtime.registry.behaviorHash,
    mappingFingerprint: runtime.mapping.get(state.collection.key).fingerprint,
    upload: state.collection.upload !== undefined,
    capabilities: {
      autosave: state.collection.mode === 'drafts',
      publication: state.collection.mode === 'drafts',
      localizedPublication: state.collection.localizeStatus === true,
      schedules: state.collection.mode === 'drafts',
      history: state.collection.history !== false,
      trash: true,
      purge: true,
    },
  };
}

async function listCollections(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  parse(runtime.schemas['collections.list'], raw);
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    async work(tx) {
      const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
      await runtime.authorize(executor, ctx, 'collections.list');
      const rows = [];
      for (const definition of runtime.registry.list) {
        const collection = await runtime.resolveCollection(executor, definition.key);
        try {
          const actor = await runtime.authorize(executor, ctx, 'collections.get', {
            scopeKind: 'collection',
            collectionKey: collection.key,
          });
          if (!actor) fail('unauthenticated');
          const state = {
            tx: executor,
            ctx,
            actor,
            collection,
            operationId: 'collections.get',
            locale: resolveLocale(collection),
            mode: 'editing' as const,
          };
          if (collectionPredicate(state)) fail('invalid_input');
          rows.push(metadata(state, runtime));
        } catch (error) {
          if (!denied(error)) throw error;
        }
      }
      if (Buffer.byteLength(JSON.stringify(rows)) > runtime.limits.maxResponseBytes)
        fail('capacity_exceeded');
      return { rows };
    },
  });
}

export function createCollectionApi(runtime: ContentRuntime) {
  return {
    listCollections: (ctx: RequestContext, raw: unknown) => listCollections(runtime, ctx, raw),
    getCollection: (ctx: RequestContext, raw: unknown) => {
      const input = parse(runtime.schemas['collections.get'], raw);
      return createRunner(runtime)(
        { ctx, operationId: 'collections.get', collection: input.collection },
        (state) => Promise.resolve(metadata(state, runtime)),
      );
    },
  };
}
