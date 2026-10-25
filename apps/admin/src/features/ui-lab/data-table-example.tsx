'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { ColumnSelector, DataTable, Pagination, SortSelect } from '@new-cms/ui/data';
import type { DataTableSort } from '@new-cms/ui/data';
import { NativeSelect } from '@new-cms/ui/forms';
import { ListContent, ListFooter, ListPanel, ListToolbar } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';
import { createExampleDocuments, queryExampleDocuments } from './list-data';
import { createDataColumns } from './data-table-columns';
import type { ListQuery } from './list-query';
import { LabOutput, LabSection } from './lab-section';

const columnKeys = ['title', 'enabled', 'count', 'updatedAt', 'status', 'relationship', 'actions'];

export function DataTableExample() {
  const t = useTranslations('data');
  const locale = useShell((state) => state.locale);
  const [rows] = useState(() =>
    createExampleDocuments().map((row, index) => ({ ...row, ordinal: index + 1 })),
  );
  const [view, setView] = useState('ready');
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [visible, setVisible] = useState<readonly string[]>(columnKeys);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [event, setEvent] = useState('');
  const knownSort: ListQuery['sort'] =
    sort && (sort.key === 'title' || sort.key === 'updatedAt')
      ? { key: sort.key, direction: sort.direction }
      : null;
  const ordered = queryExampleDocuments(
    rows,
    { q: '', status: 'all', sort: knownSort, page, pageSize },
    locale,
  );
  const pageRows = view === 'empty' ? [] : ordered.slice((page - 1) * pageSize, page * pageSize);
  const total = view === 'empty' ? 0 : ordered.length;
  const selectedPage = selected.filter((id) => pageRows.some((row) => row.id === id));
  const columns = createDataColumns({
    copy: t,
    locale,
    onAction: (row) => setEvent(row.title[locale]),
  }).filter((column) => visible.includes(column.key));
  function changeSort(value: DataTableSort | null) {
    setSort(value);
    setPage(1);
    setSelected([]);
  }
  return (
    <LabSection title={t('table')} description={t('tableDescription')}>
      <ListPanel>
        <ListToolbar>
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              aria-label={t('view')}
              value={view}
              onChange={(change) => {
                setView(change.currentTarget.value);
                setPage(1);
                setSelected([]);
              }}
            >
              {(['ready', 'loading', 'empty', 'error'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </NativeSelect>
            <ColumnSelector
              label={t('columns')}
              columns={columnKeys.map((key) => ({
                key,
                label: t(key),
                locked: key === 'title' || key === 'actions',
              }))}
              selectedKeys={visible}
              onChange={setVisible}
            />
          </div>
          <SortSelect
            columns={[
              { key: 'title', label: t('title') },
              { key: 'updatedAt', label: t('updatedAt') },
            ]}
            value={sort}
            onChange={changeSort}
            labels={{
              label: t('sort'),
              noneLabel: t('noSort'),
              ascendingLabel: t('ascending'),
              descendingLabel: t('descending'),
            }}
          />
        </ListToolbar>
        {selectedPage.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm">
            <span>{t('selected', { count: selectedPage.length })}</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              {t('clear')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEvent(selectedPage.join(', '))}>
              {t('record')}
            </Button>
          </div>
        )}
        <ListContent>
          <DataTable
            rows={pageRows}
            columns={columns}
            rowKey={(row) => row.id}
            sort={sort}
            onSortChange={changeSort}
            selectedIds={selectedPage}
            onSelectionChange={setSelected}
            isRowSelectable={(row) => row.id !== 'example-introduction'}
            selectionLabel={t('selectAll')}
            rowSelectionLabel={(row) => t('selectRow', { title: row.title[locale] })}
            loading={view === 'loading'}
            error={view === 'error' ? t('errorMessage') : null}
            onRetry={() => setView('ready')}
            retryLabel={t('retry')}
            emptyLabel={t('emptyMessage')}
            loadingLabel={t('loadingMessage')}
          />
        </ListContent>
        <ListFooter>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(next) => {
              setPage(next);
              setSelected([]);
            }}
            onPageSizeChange={(change) => {
              setPageSize(change.pageSize);
              setPage(change.page);
              setSelected([]);
            }}
            pageSizeOptions={[5, 10]}
            pageSizeLabel={t('pageSize')}
            previousLabel={t('previous')}
            nextLabel={t('next')}
            pageLabel={t('page', {
              page,
              pages: Math.max(1, Math.ceil(total / pageSize)),
            })}
            totalLabel={t('total', { count: total })}
          />
        </ListFooter>
      </ListPanel>
      <LabOutput label={t('event')} value={event} />
    </LabSection>
  );
}
