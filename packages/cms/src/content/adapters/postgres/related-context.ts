import { fail } from '@new-cms/cms/platform/contracts';
import { targetReadContext } from '../../queries/resolve-locale.ts';
import { alias } from './query-context.ts';
import type { QueryContext } from './query-context.ts';
import type { CompiledCollection, RelationScope } from '../../model.ts';

export function relationScope(context: QueryContext, target: string): RelationScope {
  const { locale } = targetReadContext({
    collection: context.mapping.get(target).definition,
    locale: context.query.locale,
  });
  const scope = context.relationScopes.find(
    (candidate) => candidate.collection === target && candidate.locale === locale,
  );
  if (!scope) fail('forbidden');
  return scope;
}

export function relatedContext(
  context: QueryContext,
  collection: CompiledCollection,
  scope: RelationScope,
): QueryContext {
  const { nearOrder: _near, valueReadableFields: _read, ...base } = context;
  return {
    ...base,
    collection,
    query: { ...context.query, locale: scope.locale, fallback: scope.fallback },
    documentAlias: alias(context, 'td'),
    revisionAlias: alias(context, 'tr'),
    queryableFields: scope.queryableFields,
    ...(scope.readableFields ? { valueReadableFields: scope.readableFields } : {}),
    relationDepth: context.relationDepth + 1,
  };
}
