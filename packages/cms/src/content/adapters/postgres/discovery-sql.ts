import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../../types.ts';
import type { Visibility } from '../../jobs/discovery-policy.ts';
import { assertDiscoveryWhere } from '../../jobs/discovery-policy.ts';
import { contextFor } from './query-documents.ts';
import { compileWhere } from './compile-query.ts';
import { parameter, trustedContext } from './query-context.ts';

export interface DiscoveryRelation {
  sql: string;
  values: unknown[];
}

export interface DiscoverySql {
  values: unknown[];
  budget: { nodes: number };
  ctes: string[];
  visibility: Map<string, string>;
  parameter(value: unknown): string;
  relation(relation: DiscoveryRelation): string;
}

export function discoverySql(): DiscoverySql {
  const values: unknown[] = [];
  return {
    values,
    ctes: [],
    visibility: new Map(),
    budget: { nodes: 0 },
    parameter(value) {
      values.push(value);
      return `$${values.length}`;
    },
    relation(relation) {
      const offset = values.length;
      values.push(...relation.values);
      return relation.sql.replaceAll(
        /\$(\d+)/g,
        (_match, index: string) => `$${Number(index) + offset}`,
      );
    },
  };
}

export function visibleDocuments(
  input: { state: ContentState; runtime: ContentRuntime; sql: DiscoverySql },
  visibility: Visibility,
): string {
  if (visibility === false) return 'SELECT NULL::uuid AS id WHERE false';
  const { state, runtime, sql } = input;
  for (const predicate of visibility.predicates) assertDiscoveryWhere(predicate, runtime);
  const key = JSON.stringify(visibility);
  const cached = sql.visibility.get(key);
  if (cached) return `SELECT id FROM ${cached}`;
  const context = contextFor(
    {
      collection: state.collection.key,
      mapping: runtime.mapping,
      limits: runtime.limits,
      relationScopes: visibility.relations,
      query: {
        page: 1,
        pageSize: 1,
        locale: visibility.locale,
        fallback: [],
        mode: 'editing',
        select: [],
        sort: [],
      },
    },
    sql.budget,
  );
  const terms = [`d.collection_id=${parameter(context, state.collection.id)}`];
  if (!visibility.includeTrashed) terms.push('d.trashed_at IS NULL');
  for (const predicate of visibility.predicates)
    terms.push(compileWhere(predicate, trustedContext(context)));
  const statement = sql.relation({
    sql: `SELECT d.id FROM content_documents d JOIN content_revisions r ON r.id=d.current_version_id ${[...context.joins.values()].join(' ')} WHERE ${terms.join(' AND ')}`,
    values: context.values,
  });
  const name = `discovery_visible_${sql.visibility.size}`;
  sql.visibility.set(key, name);
  sql.ctes.push(`${name} AS NOT MATERIALIZED (${statement})`);
  return `SELECT id FROM ${name}`;
}

export function discoveryOffset(query: { page: number; pageSize: number }): number {
  const offset = (query.page - 1) * query.pageSize;
  if (!Number.isSafeInteger(offset)) fail('invalid_input');
  return offset;
}
