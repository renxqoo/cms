import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits } from '../../definition.ts';
import type { ContentMapping, StoredPage } from '../../model.ts';
import type { CollectionsQueryInput } from './store-contract.ts';
import { queryJoinedDocuments } from './query-union.ts';
import { metadataColumns } from './query-context.ts';

export async function queryCollections(
  tx: SqlExecutor,
  input: CollectionsQueryInput & { mapping: ContentMapping; limits: ContentLimits },
): Promise<StoredPage> {
  if (
    input.sort.some(
      (sort) =>
        !Object.hasOwn(metadataColumns, sort.field) || !['asc', 'desc'].includes(sort.order),
    )
  )
    fail('invalid_input');
  const result = await queryJoinedDocuments(tx, {
    ...input,
    groups: [{ key: '', collections: input.collections }],
    count: true,
  });
  const page = result.get('');
  if (page?.total === undefined) fail('temporarily_unavailable');
  return { rows: page.rows, total: page.total, page: page.page, pageSize: page.pageSize };
}
