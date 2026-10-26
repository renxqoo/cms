import { contentOperations } from '../operations.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import { itemOperation } from './execute-item.ts';
import { visibleFor } from './discovery-policy.ts';
import type { DiscoveryPolicy } from './discovery-policy.ts';
import { visibleDocuments } from '../adapters/postgres/discovery-sql.ts';
import type { DiscoverySql } from '../adapters/postgres/discovery-sql.ts';

export interface ContentDiscoveryInput {
  state: ContentState;
  runtime: ContentRuntime;
  policy: DiscoveryPolicy;
  sql: DiscoverySql;
}

export async function contentJobEligibility(input: ContentDiscoveryInput) {
  const { state, policy, sql } = input;
  const sources = ['content.batch', 'content.schedulePublication'];
  sources.push(
    ...contentOperations
      .filter((operation) => operation.method !== 'GET')
      .map((operation) => operation.id),
  );
  const items: string[] = [];
  const extensions: string[] = [];
  for (const source of new Set(sources)) {
    const original = await policy.policy(source, state.locale);
    if (original === false) continue;
    const result = await visibleFor(state, {
      policy,
      operations: [{ id: 'documents.get' }],
      includeTrashed: true,
      inheritPredicate: false,
    });
    const results = visibleDocuments(input, result);
    const sourceId = sql.parameter(source);
    if (source === 'content.batch' || source === 'content.schedulePublication')
      items.push(...(await itemEligibility(input, { source, sourceId, results })));
    const extension = await visibleFor(state, {
      policy,
      operations: [{ id: 'content.getJob' }, { id: source }, { id: 'documents.get' }],
    });
    const documents = visibleDocuments(input, extension);
    extensions.push(`(j.source_operation=${sourceId} AND j.document_id IN (${documents}))`);
  }
  return {
    items: items.length > 0 ? items.join(' OR ') : 'false',
    extensions: extensions.length > 0 ? extensions.join(' OR ') : 'false',
  };
}

async function itemEligibility(
  input: ContentDiscoveryInput,
  source: { source: string; sourceId: string; results: string },
): Promise<string[]> {
  const result: string[] = [];
  const { state, policy, sql } = input;
  const actions = source.source === 'content.schedulePublication'
    ? ['publish', 'unpublish'] as const
    : ['update', 'copy', 'archive', 'restoreTrash'] as const;
  for (const action of actions) {
    for (const locale of state.collection.locales.supported) {
      const operation = itemOperation(action);
      const visibility = await visibleFor(state, {
        policy,
        operations: [
          { id: 'content.getJob', locale: state.locale },
          { id: source.source, locale: state.locale },
          { id: operation, locale },
        ],
        locale,
        includeTrashed: true,
      });
      if (visibility === false) continue;
      const documents = visibleDocuments(input, visibility);
      result.push(
        `(j.source_operation=${source.sourceId} AND i.payload->>'action'=${sql.parameter(action)} AND i.payload->>'locale'=${sql.parameter(locale)} AND i.document_id IN (${documents}) AND COALESCE(i.result_document_id,i.document_id) IN (${source.results}))`,
      );
    }
  }
  return result;
}
