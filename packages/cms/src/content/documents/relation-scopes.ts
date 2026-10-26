import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import { authorizeStateOperation, collectionPredicate, policyContext } from '../runtime.ts';
import { queryableFields } from '../fields/policies.ts';
import { targetReadContext } from '../queries/resolve-locale.ts';
import type { RelationScope } from '../model.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export function denied(error: unknown): boolean {
  return (
    error instanceof CmsError && ['forbidden', 'endpoint_unbound', 'not_found'].includes(error.code)
  );
}

export async function targetState(
  state: ContentState,
  input: { runtime: ContentRuntime; collection: string },
): Promise<ContentState> {
  const actor = await authorizeStateOperation(state, {
    runtime: input.runtime,
    operationId: 'documents.get',
    collection: input.collection,
  });
  if (!actor) fail('unauthenticated');
  const collection = await input.runtime.resolveCollection(state.tx, input.collection);
  const { locale } = targetReadContext({
    collection,
    locale: state.locale,
    ...(state.fallbackOverride ? { fallback: state.fallbackOverride } : {}),
  });
  const { predicate: _old, ...base } = state;
  const next = { ...base, actor, collection, locale, operationId: 'documents.get' };
  const predicate = collectionPredicate(next);
  return { ...next, ...(predicate ? { predicate } : {}) };
}

function localeScope(
  state: ContentState,
  input: { collection: ContentState['collection']; locale: string },
): RelationScope {
  const { predicate: _old, ...base } = state;
  const target = {
    ...base,
    collection: input.collection,
    locale: input.locale,
    operationId: 'documents.get',
  };
  const read = targetReadContext({
    collection: input.collection,
    locale: input.locale,
    ...(state.fallbackOverride ? { fallback: state.fallbackOverride } : {}),
  });
  try {
    return {
      collection: input.collection.key,
      ...read,
      policy: collectionPredicate(target) ?? true,
      queryableFields: queryableFields({
        collection: input.collection,
        context: policyContext(target),
      }),
    };
  } catch (error) {
    if (!denied(error)) throw error;
    return { collection: input.collection.key, ...read, policy: false, queryableFields: [] };
  }
}

export async function relationScopes(
  state: ContentState,
  runtime: ContentRuntime,
): Promise<{ relationScopes: RelationScope[] }> {
  const scopes: RelationScope[] = [];
  for (const definition of runtime.registry.list) {
    const collection = await runtime.resolveCollection(state.tx, definition.key);
    try {
      const actor = await authorizeStateOperation(state, {
        runtime,
        operationId: 'documents.get',
        collection: collection.key,
      });
      if (!actor) fail('unauthenticated');
      for (const locale of collection.locales.supported)
        scopes.push(localeScope({ ...state, actor }, { collection, locale }));
    } catch (error) {
      if (!denied(error)) throw error;
      for (const locale of collection.locales.supported)
        scopes.push({
          collection: collection.key,
          locale,
          fallback: [],
          policy: false,
          queryableFields: [],
        });
    }
  }
  return { relationScopes: scopes };
}
