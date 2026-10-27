'use client';
import { Banner } from '@new-cms/ui/feedback';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { Collection } from '../../contracts/content';
import type { Document, DocumentPage } from '../../contracts/documents';
import type { DocumentGroups } from '../../contracts/document-groups';
import type { useApiQuery } from '../management-shared/query';
import type { useAccessControl } from '../access-control/provider';
import { ManagementList, managementListState } from '../management-shared/management-list';
import type { ContentMessages } from './messages';
import type { DocumentQuery } from './query';
import { ListSlot } from './list-customization';
import { DocumentGroupedTables } from './document-groups';
interface DocumentTableProps {
  result: ReturnType<typeof useApiQuery<DocumentPage>>;
  groups: DocumentGroups | null;
  groupColumns: (rows: Document[]) => readonly DataTableColumn<Document>[];
  collection: Collection;
  query: DocumentQuery;
  change: (patch: Partial<DocumentQuery>) => void;
  t: ContentMessages;
  columns: readonly DataTableColumn<Document>[];
  filterValid: boolean;
  denied: boolean;
  phase: ReturnType<typeof useAccessControl>['phase'];
}
export function DocumentTable(props: DocumentTableProps) {
  const { result, groups, groupColumns, collection, query, change, t, filterValid, denied, phase } =
    props;
  const table = managementListState(phase, result.phase);
  if (denied) return <Banner tone="warning">{t.denied}</Banner>;
  if (query.groupBy)
    return (
      <DocumentGroupedTables
        groups={filterValid ? groups : null}
        collection={collection}
        query={query}
        change={change}
        columns={groupColumns}
        loading={filterValid && table.loading}
        error={table.failed ? t.failed : null}
        reload={result.reload}
      />
    );
  return <DocumentFlatTable {...props} />;
}
function DocumentFlatTable({
  result,
  collection,
  query,
  change,
  t,
  columns,
  filterValid,
  phase,
}: DocumentTableProps) {
  const table = managementListState(phase, result.phase);
  return (
    <ManagementList
      columns={columns}
      rows={visibleRows(result.data, filterValid)}
      rowKey={(document) => document.id}
      page={query.page}
      pageSize={query.pageSize}
      pageSizeOptions={collection.admin?.pagination?.limits}
      total={result.data?.total ?? 0}
      loading={filterValid && table.loading}
      error={table.failed ? t.failed : null}
      query={query.q}
      onSearch={(q) => change({ q })}
      onPageChange={(page) => change({ page })}
      onPageSizeChange={(pageSize) => change({ pageSize })}
      sort={{
        key: collection.fields.some((field) => field.path === query.sort[0]?.field)
          ? `field:${query.sort[0]?.field}`
          : (query.sort[0]?.field ?? 'updatedAt'),
        direction: query.sort[0]?.order === 'asc' ? 'asc' : 'desc',
      }}
      onSortChange={(sort) =>
        change({
          sort: [
            {
              field: sort?.key.replace(/^field:/, '') ?? 'updatedAt',
              order: sort?.direction ?? 'desc',
            },
          ],
        })
      }
      renderEmpty={(fallback) => (
        <ListSlot collection={collection} slot="NoResults">
          {fallback}
        </ListSlot>
      )}
      onRetry={result.reload}
    />
  );
}

function visibleRows(data: DocumentPage | null, valid: boolean) {
  return valid ? (data?.rows ?? []) : [];
}
