import { useApiQuery } from '../management-shared/query';
import { documentPageSchema } from '../../contracts/documents';
import type { DocumentPage, Document } from '../../contracts/documents';
import { documentGroupsSchema } from '../../contracts/document-groups';
import type { DocumentGroups } from '../../contracts/document-groups';
import type { Collection } from '../../contracts/content';
import type { DocumentQuery } from './query';
import { queryFilter } from './query';

function documentApiQuery(query: DocumentQuery, collection: Collection) {
  const filter = queryFilter(query, collection);
  return {
    context: 'admin',
    page: query.page,
    pageSize: query.pageSize,
    q: query.q,
    mode: query.mode,
    trashed: query.trashed,
    locale: query.locale,
    fallback: [],
    depth: 0,
    sort: query.sort,
    ...(filter.where ? { where: filter.where } : {}),
    ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
  };
}

function documentPage(groups: DocumentGroups | null): DocumentPage | null {
  if (!groups) return null;
  const rows = new Map<string, Document>();
  for (const group of groups.rows) for (const row of group.documents.rows) rows.set(row.id, row);
  return {
    rows: [...rows.values()],
    total: groups.total,
    page: groups.page,
    pageSize: groups.pageSize,
  };
}

export function useDocumentListQuery(input: {
  collection: Collection;
  query: DocumentQuery;
  enabled: boolean;
}) {
  const { collection, query, enabled } = input;
  const values = documentApiQuery(query, collection);
  const normal = useApiQuery({
    operation: 'documents.list',
    params: { collection: collection.key },
    query: values,
    response: documentPageSchema,
    enabled: enabled && query.groupBy === null,
  });
  const grouped = useApiQuery({
    operation: 'documents.groups',
    params: { collection: collection.key },
    query: {
      ...values,
      groupBy: query.groupBy,
      groupPageSize: query.groupPageSize,
      queryByGroup: query.queryByGroup,
    },
    response: documentGroupsSchema,
    enabled: enabled && query.groupBy !== null,
  });
  return {
    result: query.groupBy ? { ...grouped, data: documentPage(grouped.data) } : normal,
    groups: query.groupBy ? grouped.data : null,
  };
}
