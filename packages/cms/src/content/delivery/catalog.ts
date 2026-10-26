import { fail } from '@new-cms/cms/platform/contracts';
import { contextFor, matchingSql } from '../adapters/postgres/query-documents.ts';
import { fieldSource, parameter } from '../adapters/postgres/query-context.ts';
import type { ContentMapping, QueryInput } from '../model.ts';
import type { PublicModelCatalog, PublicModelFacets, PublicFacet } from './contracts.ts';
import { catalogSort, catalogWhere } from './query.ts';
import type { CatalogQuery } from './query.ts';
import { projectModels } from './projection.ts';
import { collectionFor, readRows, text } from './source.ts';
import type { DeliverySession } from './types.ts';
import { modelCardFields, readProjection } from './read-shapes.ts';

const facetPaths = {
  categories: 'primaryCategory',
  developers: 'developer',
  tasks: 'technicalCapabilities.tasks',
  inputs: 'technicalCapabilities.inputs',
  outputs: 'technicalCapabilities.outputs',
  capabilities: 'technicalCapabilities.features',
} as const;
async function facetSql(session: DeliverySession, query: QueryInput) {
  const original = session.runtime.mapping;
  const collection = {
    ...original.get('models'),
    definition: await collectionFor(session, 'models'),
  };
  const mapping: ContentMapping = {
    ...original,
    get: (key, version) =>
      key === 'models' && (version === undefined || version === collection.definition.schemaVersion)
        ? collection
        : original.get(key, version),
  };
  const context = contextFor({
    collection: 'models',
    query,
    mapping,
    limits: session.runtime.limits,
  });
  const matches = matchingSql(context);
  const selects: string[] = [];
  for (const [key, path] of Object.entries(facetPaths)) {
    const field = collection.flat.find((entry) => entry.path === path);
    if (!field) fail('internal_error');
    const source = fieldSource(field, context);
    const kind = parameter(context, key);
    selects.push(
      `SELECT ${kind}::text AS kind,${source.name}.value::text AS value,count(DISTINCT m.id)::int AS count FROM matches m JOIN content_documents d ON d.id=m.id JOIN content_revisions r ON r.id=m."versionId" JOIN LATERAL (SELECT ${source.name}.value FROM ${source.from} WHERE ${source.where} AND ${source.name}.state='value') ${source.name} ON true GROUP BY ${source.name}.value`,
    );
  }
  return { context, matches, selects };
}
async function developerFacets(
  session: DeliverySession,
  items: PublicFacet[],
): Promise<PublicFacet[]> {
  if (items.length > 0) {
    const labels = new Map<string, string>();
    for (let offset = 0; offset < items.length; offset += session.runtime.limits.maxPageSize) {
      const page = await readRows(session.runtime, session.tx, {
        collection: 'developers',
        locale: session.locale,
        projection: await readProjection(session, 'developers', ['name']),
        where: {
          and: [
            {
              field: 'id',
              operator: 'in',
              value: items
                .slice(offset, offset + session.runtime.limits.maxPageSize)
                .map(({ value }) => value),
            },
            { field: 'contentLocales', operator: 'contains', value: [session.locale] },
          ],
        },
      });
      for (const row of page.rows) labels.set(row.document.id, text(row.data['name']));
    }
    return items.flatMap((facet): PublicFacet[] => {
      const label = labels.get(facet.value);
      return label === undefined ? [] : [{ ...facet, label }];
    });
  }
  return [];
}
async function facets(session: DeliverySession, query: QueryInput): Promise<PublicModelFacets> {
  const { context, matches, selects } = await facetSql(session, query);
  const result = await session.tx.query<{
    kind: keyof PublicModelFacets;
    value: string;
    count: number;
  }>(
    `WITH matches AS MATERIALIZED (${matches.sql}), facets AS (${selects.join(' UNION ALL ')}) SELECT * FROM facets ORDER BY kind,value LIMIT $${context.values.length + 1}`,
    [...context.values, session.runtime.limits.maxExpandNodes + 1],
  );
  if (result.rows.length > session.runtime.limits.maxExpandNodes) fail('capacity_exceeded');
  const output: PublicModelFacets = {
    categories: [],
    developers: [],
    tasks: [],
    inputs: [],
    outputs: [],
    capabilities: [],
  };
  for (const row of result.rows)
    output[row.kind].push({ value: row.value, label: row.value, count: row.count });
  output.developers = await developerFacets(session, output.developers);
  return output;
}
export async function readCatalog(
  session: DeliverySession,
  input: CatalogQuery,
): Promise<PublicModelCatalog> {
  const where = catalogWhere(input, session.locale);
  const query: QueryInput = {
    mode: 'published',
    locale: session.locale,
    fallback: [],
    where,
    page: input.page,
    pageSize: input.pageSize,
    sort: catalogSort(input.sort),
    ...(input.q ? { q: input.q } : {}),
  };
  const page = await session.runtime.store.queryDocuments(session.tx, {
    collection: 'models',
    query,
    limits: session.runtime.limits,
    projection: await readProjection(session, 'models', modelCardFields),
    ...(input.sort === 'updated' ? { orderByPublished: true } : {}),
  });
  return {
    models: await projectModels(session, page.rows),
    pagination: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: Math.ceil(page.total / page.pageSize),
    },
    facets: await facets(session, query),
  };
}
