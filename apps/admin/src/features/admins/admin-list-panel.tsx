import { Button } from '@new-cms/ui/actions';
import { DataTable, Pagination } from '@new-cms/ui/data';
import { Banner } from '@new-cms/ui/feedback';
import { ListContent, ListFooter, ListPanel, ListToolbar } from '@new-cms/ui/layout';
import type { Admin, Page } from '../../contracts/access';
import type { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { adminColumns } from './admin-list-columns';
import { AdminListToolbar } from './admin-list-toolbar';
import { isAdminSort } from './admins-query';
import type { AdminListQuery, AdminQueryChanges } from './admins-query';
import type { AdminsMessages } from './admins-messages';

export function AdminListPanel({
  result,
  query,
  locale,
  pending,
  canReadDetails,
  change,
  messages: t,
}: {
  result: ReturnType<typeof useApiQuery<Page<Admin>>>;
  query: AdminListQuery;
  locale: 'zh' | 'en';
  pending: boolean;
  canReadDetails: boolean;
  change: (changes: AdminQueryChanges) => void;
  messages: AdminsMessages;
}) {
  const data = result.phase === 'ready' ? result.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <ListPanel>
      <ListToolbar>
        <AdminListToolbar query={query} change={change} messages={t} />
      </ListToolbar>
      <ListContent>
        <ManagementFeedback error={result.error} onRetry={result.reload} />
        <DataTable
          columns={adminColumns({ messages: t, locale, canRead: canReadDetails })}
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          sort={{ key: query.sortBy, direction: query.order }}
          onSortChange={(sort) => {
            if (!sort) change({ sort: null });
            else if (isAdminSort(sort.key))
              change({ sort: { key: sort.key, direction: sort.direction } });
          }}
          loading={result.phase === 'loading' || pending}
          loadingLabel={t.loading}
          error={result.error ? t.loadError : null}
          emptyLabel={t.empty}
        />
        {data && data.page > pages ? (
          <Banner className="m-4 flex flex-wrap items-center gap-3">
            <p>{t.outOfRange}</p>
            <Button size="sm" variant="outline" onClick={() => change({ page: 1 })}>
              {t.firstPage}
            </Button>
          </Banner>
        ) : null}
      </ListContent>
      {data ? (
        <ListFooter>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageChange={(page) => change({ page })}
            onPageSizeChange={(next) => change({ page: next.page, pageSize: next.pageSize })}
            previousLabel={t.previous}
            nextLabel={t.next}
            pageLabel={t.page
              .replace('{page}', String(data.page))
              .replace('{pages}', String(pages))}
            totalLabel={t.total.replace('{total}', String(data.total))}
            pageSizeLabel={t.pageSize}
          />
        </ListFooter>
      ) : null}
    </ListPanel>
  );
}
