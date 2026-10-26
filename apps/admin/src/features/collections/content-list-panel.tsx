'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { DataTable, Pagination } from '@new-cms/ui/data';
import { Banner } from '@new-cms/ui/feedback';
import { ListPanel, ListContent, ListFooter } from '@new-cms/ui/layout';
import type { Collection, Document, DocumentPage } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionScope } from './content-policy';
import { documentTitle } from './document-label';
import { ContentFilterDialog } from './content-filter-dialog';
import { BatchDocuments } from './batch-documents';
import { contentColumns } from './content-list-columns';
import { ContentListToolbar } from './content-list-toolbar';
import type { ContentQuery } from './content-query';
import type { ContentMessages } from './content-messages';
import type { ContentFailure } from './channel-types';
export function ContentListPanel({
  collection,
  query,
  result,
  change,
  messages: t,
}: {
  collection: Collection;
  query: ContentQuery;
  result: {
    phase: string;
    data: DocumentPage | null;
    error: ContentFailure | null;
    reload: () => void;
  };
  change: (changes: Partial<ContentQuery>) => void;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState<ReadonlyMap<string, Document>>(new Map());
  const data = result.phase === 'ready' ? result.data : null;
  const canRead = access.can('documents.get', collectionScope(collection.key));
  const columns = contentColumns({
    collection,
    query,
    canRead,
    onChanged: result.reload,
    messages: t,
  });
  function select(ids: string[]) {
    setSelected((current) => {
      const next = new Map(current);
      for (const document of data?.rows ?? []) {
        if (ids.includes(document.id)) next.set(document.id, document);
        else next.delete(document.id);
      }
      return next;
    });
  }
  return (
    <div className="space-y-4">
      {query.invalid ? <Banner tone="error">{t.filterInvalid}</Banner> : null}
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      <ListPanel>
        <ContentListToolbar
          collection={collection}
          query={query}
          change={change}
          onFilters={() => setFilters(true)}
          messages={t}
        />
        <ListContent>
          <DataTable
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(document) => document.id}
            loading={result.phase === 'loading'}
            error={result.error ? t.unavailable : null}
            emptyLabel={t.empty}
            loadingLabel={t.loading}
            sort={
              query.sort[0] ? { key: query.sort[0].field, direction: query.sort[0].order } : null
            }
            onSortChange={(sort) =>
              change({ sort: sort ? [{ field: sort.key, order: sort.direction }] : [] })
            }
            selectedIds={[...selected.keys()]}
            selectionLabel={t.selectAll}
            rowSelectionLabel={(document) => `${t.select} ${documentTitle(document, collection)}`}
            onSelectionChange={select}
          />
        </ListContent>
        {data ? <ContentListPagination data={data} change={change} messages={t} /> : null}
      </ListPanel>
      <BatchDocuments
        collection={collection}
        documents={[...selected.values()]}
        trashed={query.trashed}
        locale={query.locale}
        onChanged={() => {
          setSelected(new Map());
          result.reload();
        }}
        messages={t}
      />
      {filters ? (
        <ContentFilterDialog
          collection={collection}
          initial={query.where}
          onClose={() => setFilters(false)}
          onApply={(where) => change({ where })}
          messages={t}
        />
      ) : null}
    </div>
  );
}
function ContentListPagination({
  data,
  change,
  messages: t,
}: {
  data: DocumentPage;
  change: (changes: Partial<ContentQuery>) => void;
  messages: ContentMessages;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <ListFooter>
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={(page) => change({ page })}
        onPageSizeChange={(value) => change({ page: value.page, pageSize: value.pageSize })}
        previousLabel={t.previous}
        nextLabel={t.next}
        pageSizeLabel={t.pageSize}
        pageLabel={`${t.page} ${data.page} / ${pages}`}
        totalLabel={`${data.total} ${t.total}`}
      />
      {data.page > pages ? (
        <Button variant="outline" onClick={() => change({ page: 1 })}>
          {t.previous}
        </Button>
      ) : null}
    </ListFooter>
  );
}
