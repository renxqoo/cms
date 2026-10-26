import { fail } from '@new-cms/cms/platform/contracts';
import type { Principal } from '@new-cms/cms/access';
import type { Where } from '../definition.ts';
import type { RelationScope } from '../model.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import { authorizeStateOperation, collectionPredicate, policyUsesRelations } from '../runtime.ts';
import { denied } from '../documents/relation-scopes.ts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { assertWhereBudget } from '../queries/parse-query.ts';
import { assertRawQueryBudget } from '../queries/query-budget.ts';

export interface DiscoveryVisibility {
  locale: string;
  predicates: readonly Where[];
  relations: readonly RelationScope[];
  includeTrashed: boolean;
}

export type Visibility = DiscoveryVisibility | false;
export type DiscoveryPolicy = ReturnType<typeof createDiscoveryPolicy>;

export function createDiscoveryPolicy(state: ContentState, runtime: ContentRuntime) {
  if (state.predicate) assertDiscoveryWhere(state.predicate, runtime);
  const actors = new Map<string, Promise<Principal | false>>();
  const policies = new Map<string, Promise<Where | true | false>>();
  let scopes: Promise<RelationScope[]> | undefined;
  function actor(
    operationId: string,
    collection = state.collection.key,
  ): Promise<Principal | false> {
    const key = `${collection}:${operationId}`;
    let result = actors.get(key);
    if (!result) {
      result = authorizeStateOperation(state, { runtime, operationId, collection }).then(
        (value) => value ?? false,
        (error: unknown) => {
          if (!denied(error)) throw error;
          return false;
        },
      );
      actors.set(key, result);
    }
    return result;
  }
  function policy(
    operationId: string,
    locale: string,
    collection = state.collection.key,
  ): Promise<Where | true | false> {
    const key = `${collection}:${operationId}:${locale}`;
    let result = policies.get(key);
    if (!result) {
      result = evaluatePolicy(state, { runtime, actor, operationId, locale, collection });
      policies.set(key, result);
    }
    return result;
  }
  function relations(): Promise<RelationScope[]> {
    scopes ??= relationPolicies(state, runtime, { policy });
    return scopes;
  }
  return {
    actor,
    policy,
    relations,
    require: (operationId: string) =>
      requireDiscoveryActor(state, { runtime, actors, operationId }),
    runtime,
  };
}

async function requireDiscoveryActor(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    actors: Map<string, Promise<Principal | false>>;
    operationId: string;
  },
): Promise<void> {
  const actor = await authorizeStateOperation(state, {
    runtime: input.runtime,
    operationId: input.operationId,
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  input.actors.set(`${state.collection.key}:${input.operationId}`, Promise.resolve(actor));
}

type PolicyReader = DiscoveryPolicy['policy'];

async function evaluatePolicy(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    actor: DiscoveryPolicy['actor'];
    operationId: string;
    locale: string;
    collection: string;
  },
): Promise<Where | true | false> {
  const actor = await input.actor(input.operationId, input.collection);
  if (!actor) return false;
  const collection = await input.runtime.resolveCollection(state.tx, input.collection);
  if (!collection.locales.supported.includes(input.locale)) fail('invalid_input');
  try {
    const predicate = collectionPredicate({
      ...state,
      actor,
      collection,
      operationId: input.operationId,
      locale: input.locale,
      mode: 'editing',
    });
    if (predicate) assertDiscoveryWhere(predicate, input.runtime);
    return predicate ?? true;
  } catch (error) {
    if (!denied(error)) throw error;
    return false;
  }
}

async function relationPolicies(
  state: ContentState,
  runtime: ContentRuntime,
  input: { policy: PolicyReader },
): Promise<RelationScope[]> {
  const result: RelationScope[] = [];
  for (const definition of runtime.registry.list) {
    const collection = await runtime.resolveCollection(state.tx, definition.key);
    for (const locale of collection.locales.supported) {
      const read = targetReadContext({ collection, locale });
      result.push({
        collection: collection.key,
        ...read,
        policy: await input.policy('documents.get', read.locale, collection.key),
        queryableFields: [],
      });
    }
  }
  return result;
}

export async function visibleFor(
  state: ContentState,
  input: {
    policy: DiscoveryPolicy;
    operations: readonly { id: string; locale?: string }[];
    locale?: string;
    includeTrashed?: boolean;
    inheritPredicate?: boolean;
  },
): Promise<Visibility> {
  const locale = input.locale ?? state.locale;
  const predicates = state.predicate && input.inheritPredicate !== false ? [state.predicate] : [];
  for (const operation of input.operations) {
    const value = await input.policy.policy(operation.id, operation.locale ?? locale);
    if (value === false) return false;
    if (value !== true) predicates.push(value);
  }
  return {
    locale,
    predicates: [
      ...new Map(predicates.map((predicate) => [JSON.stringify(predicate), predicate])).values(),
    ],
    relations: predicates.some((predicate) =>
      policyUsesRelations({ ...state, predicate }, input.policy.runtime),
    )
      ? await input.policy.relations()
      : [],
    includeTrashed: input.includeTrashed ?? false,
  };
}

export function assertDiscoveryWhere(predicate: Where, runtime: ContentRuntime): void {
  assertRawQueryBudget({ policy: predicate }, runtime.limits);
  assertWhereBudget(predicate, runtime.limits);
}
