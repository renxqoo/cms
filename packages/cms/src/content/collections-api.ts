import { resolveComponentProps } from './editor/component-props.ts';
import { componentBindings, collectionComponentBindings } from './editor/component-bindings.ts';
import { draftSettings } from './collections/draft-config.ts';
import { operationControls } from './lifecycle/operation-controls.ts';
import { authorshipMetadata, authorReadPermission } from './authorship/api.ts';
import { withContentDeadline } from './hooks/deadline.ts';
import { policyScope } from './hooks/invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { collectionMetadata } from './fields/policy-metadata.ts';
import {
  budgetedExecutor,
  collectionPredicate,
  createRunner,
  parse,
  policyContext,
} from './runtime.ts';
import { denied } from './documents/relation-scopes.ts';
import type { ContentRuntime, ContentState } from './types.ts';
import { presetConstraintsMetadata } from './queries/preset-metadata.ts';
import { hierarchyMetadata } from './hierarchy/metadata.ts';
import { adminHidden } from './collections/admin-visibility.ts';
import { targetReadContext } from './queries/resolve-locale.ts';

export async function metadata(state: ContentState, runtime: ContentRuntime) {
  const collection = await collectionMetadata({
    ...policyScope(state),
    collection: state.collection,
    context: policyContext(state),
    adminComponents: runtime.registry.adminComponents,
  });
  const drafts = draftSettings(state.collection);
  return {
    ...collection,
    admin: { ...collection.admin, hidden: await adminHidden(state) },
    queryPresetConstraints: await presetConstraintsMetadata(state),
    componentProps: await resolveComponentProps(state, {
      runtime,
      data: {},
      bindings: [
        ...collectionComponentBindings(state.collection, 'collection'),
        ...collection.fields.flatMap((field) =>
          componentBindings(`${field.path}#${field.id}`, field.components)
            .filter((binding) => binding.slot === 'Filter')
            .map((binding) => ({ ...binding, path: field.path })),
        ),
      ],
    }),
    drafts,
    ...operationControls(state.collection),
    authorship: authorshipMetadata(state),
    hierarchy: hierarchyMetadata(state, {
      runtime,
      visible: new Set(collection.fields.map((field) => field.path)),
    }),
    behaviorHash: runtime.registry.behaviorHash,
    mappingFingerprint: runtime.mapping.get(state.collection.key).fingerprint,
    upload: state.collection.upload !== undefined,
    capabilities: {
      autosave: Boolean(drafts?.autosave),
      publication: state.collection.mode === 'drafts',
      localizedPublication: state.collection.localizeStatus === true,
      schedules: drafts?.schedule === true,
      history: state.collection.history !== false,
      trash: true,
      purge: true,
    },
  };
}

async function listCollectionsWithinDeadline(
  runtime: ContentRuntime,
  ctx: RequestContext,
  raw: unknown,
) {
  const input = parse(runtime.schemas['collections.list'], raw);
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    async work(tx) {
      const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
      await runtime.authorize(executor, ctx, 'collections.list');
      const rows = [];
      const hookBudget = { used: 0 };
      for (const definition of runtime.registry.list) {
        const collection = await runtime.resolveCollection(executor, definition.key);
        try {
          const actor = await runtime.authorize(executor, ctx, 'collections.get', {
            scopeKind: 'collection',
            collectionKey: collection.key,
          });
          if (!actor) fail('unauthenticated');
          const state = {
            authorshipReadable: false,
            tx: executor,
            ctx,
            actor,
            collection,
            operationId: 'collections.get',
            locale: targetReadContext({
              collection,
              locale: input.locale ?? collection.locales.default,
            }).locale,
            mode: 'editing' as const,
            hookBudget,
            hookLimits: runtime.limits,
          };
          if (await collectionPredicate(state)) fail('invalid_input');
          state.authorshipReadable = await authorReadPermission(state, runtime);
          rows.push(await metadata(state, runtime));
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
    listCollections: (ctx: RequestContext, raw: unknown) =>
      withContentDeadline({
        timeoutMs: runtime.policy.requestTimeoutMs,
        ...(ctx.signal ? { signal: ctx.signal } : {}),
        work: (signal) => listCollectionsWithinDeadline(runtime, { ...ctx, signal }, raw),
      }),
    getCollection: (ctx: RequestContext, raw: unknown) => {
      const input = parse(runtime.schemas['collections.get'], raw);
      return createRunner(runtime)(
        {
          ctx,
          operationId: 'collections.get',
          collection: input.collection,
          ...(input.locale ? { locale: input.locale } : {}),
        },
        async (state) => {
          const result = await metadata(state, runtime);
          if (result.admin.hidden) fail('not_found');
          return result;
        },
      );
    },
  };
}
