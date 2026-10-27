import { fail } from '@new-cms/cms/platform/contracts';
import { policyScope } from '../hooks/invoke.ts';
import { collectionMetadata, readableQueryFields } from '../fields/policy-metadata.ts';
import { parse, policyContext, queryDefaults, permittedQueryFields } from '../runtime.ts';
import { contextFor, querySql, matchingSql } from '../adapters/postgres/query-documents.ts';
import { groupProjection } from '../adapters/postgres/group-values.ts';
import { adminQuery } from './admin-context.ts';
import { parseQuery } from './parse-query.ts';
import { assertRawQueryBudget } from './query-budget.ts';
import { queryPresetQuerySchema } from './preset-contracts.ts';
import type { QueryPresetQuery } from './preset-contracts.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

async function validateColumns(state: ContentState, requested: readonly string[]): Promise<void> {
  const columns = new Set(
    (
      await collectionMetadata({
        ...policyScope(state),
        collection: state.collection,
        context: policyContext(state),
      })
    ).fields.map((field) => field.path),
  );
  if (
    new Set(requested).size !== requested.length ||
    requested.some((column) => !columns.has(column))
  )
    fail('forbidden');
}

export async function validatePresetQuery(
  state: ContentState,
  runtime: ContentRuntime,
  input: { raw: unknown; relations: Awaited<ReturnType<ContentRuntime['resolveRelationScopes']>> },
): Promise<QueryPresetQuery> {
  assertRawQueryBudget(input.raw, runtime.limits);
  const query = parse(queryPresetQuerySchema, input.raw);
  await validateColumns(state, query.columns);
  const options = await presetQueryOptions(state, runtime, { query, relations: input.relations });
  querySql(contextFor(options), state.predicate);
  if (query.groupBy)
    matchingSql(contextFor(options), state.predicate, {
      rowNumber: false,
      sort: false,
      selectProjection: (context) =>
        `${groupProjection(context, query.groupBy?.field ?? '')} AS value`,
    });
  return query;
}

async function presetQueryOptions(
  state: ContentState,
  runtime: ContentRuntime,
  input: {
    query: QueryPresetQuery;
    relations: Awaited<ReturnType<ContentRuntime['resolveRelationScopes']>>;
  },
) {
  const { query } = input;
  const parsed = await adminQuery(
    state,
    runtime,
    parseQuery({
      collection: state.collection,
      limits: runtime.limits,
      input: {
        ...queryDefaults(state, runtime),
        context: 'admin',
        ...(query.where !== undefined ? { where: query.where } : {}),
        sort: query.sort,
        q: query.q,
        select: [],
      },
    }),
  );
  const options = {
    mapping: runtime.mapping,
    collection: state.collection.key,
    query: parsed,
    queryableFields: await permittedQueryFields(
      state,
      query.groupBy ? { linkedVirtual: true } : {},
    ),
    ...(query.groupBy
      ? {
          valueReadableFields: await readableQueryFields({
            ...policyScope(state),
            collection: state.collection,
            context: policyContext(state),
          }),
        }
      : {}),
    limits: runtime.limits,
    ...input.relations,
  };
  return options;
}
