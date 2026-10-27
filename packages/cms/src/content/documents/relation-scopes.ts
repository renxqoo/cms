import { authorReadPermission } from '../authorship/api.ts';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import {
  authorizeStateOperation,
  collectionPredicate,
  permittedQueryFields,
  policyContext,
} from '../runtime.ts';
import { policyScope } from '../hooks/invoke.ts';
import { readableQueryFields } from '../fields/policy-metadata.ts';
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
  const predicate = await collectionPredicate(next);
  const authorshipReadable = await authorReadPermission(next, input.runtime);
  return { ...next, authorshipReadable, ...(predicate ? { predicate } : {}) };
}

async function localeScope(
  state: ContentState,
  input: { collection: ContentState['collection']; locale: string; linkedVirtual?: boolean },
): Promise<RelationScope> {
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
      policy: (await collectionPredicate(target)) ?? true,
      queryableFields: await permittedQueryFields(
        target,
        input.linkedVirtual ? { linkedVirtual: true } : {},
      ),
      ...(input.linkedVirtual
        ? {
            readableFields: await readableQueryFields({
              ...policyScope(target),
              collection: target.collection,
              context: policyContext(target),
            }),
          }
        : {}),
    };
  } catch (error) {
    if (!denied(error)) throw error;
    return { collection: input.collection.key, ...read, policy: false, queryableFields: [] };
  }
}

export async function relationScopes(
  state: ContentState,
  runtime: ContentRuntime,
  options: { linkedVirtual?: boolean } = {},
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
      const authorshipReadable = await authorReadPermission(
        { ...state, actor, collection },
        runtime,
      );
      for (const locale of collection.locales.supported)
        scopes.push(
          await localeScope(
            { ...state, actor, authorshipReadable },
            { collection, locale, ...options },
          ),
        );
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
