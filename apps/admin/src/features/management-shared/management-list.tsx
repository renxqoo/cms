'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import { DataTable, Pagination } from '@new-cms/ui/data';
import type { DataTableColumn, DataTableSort } from '@new-cms/ui/data';
import { SearchBar } from '@new-cms/ui/forms';
import { ListContent, ListFooter, ListPanel, ListToolbar } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';

const copy = {
  zh: {
    search: '搜索',
    clear: '清空搜索',
    searchLabel: '搜索记录',
    placeholder: '搜索…',
    empty: '没有匹配记录',
    loading: '正在加载…',
    previous: '上一页',
    next: '下一页',
    pageSize: '每页条数',
    retry: '重试',
  },
  en: {
    search: 'Search',
    clear: 'Clear search',
    searchLabel: 'Search records',
    placeholder: 'Search…',
    empty: 'No matching records',
    loading: 'Loading…',
    previous: 'Previous',
    next: 'Next',
    pageSize: 'Rows per page',
    retry: 'Try again',
  },
};

interface ManagementListProps<Row> {
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  error?: string | null | undefined;
  query?: string;
  onSearch?: (value: string) => void;
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  sort?: DataTableSort | null | undefined;
  onSortChange?: ((value: DataTableSort | null) => void) | undefined;
  onRetry?: (() => void) | undefined;
  filters?: ReactNode;
}

export function ManagementList<Row>(props: ManagementListProps<Row>) {
  const locale = useShell((state) => state.locale);
  const t = copy[locale];
  return (
    <ListPanel>
      {props.onSearch || props.filters ? (
        <ListToolbar>
          {props.onSearch ? (
            <ManagementSearch
              key={props.query}
              value={props.query ?? ''}
              onSearch={props.onSearch}
            />
          ) : null}
          {props.filters ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {props.filters}
            </div>
          ) : null}
        </ListToolbar>
      ) : null}
      <ListContent>
        <DataTable
          columns={props.columns}
          rows={props.rows}
          rowKey={props.rowKey}
          loading={props.loading}
          error={props.error ?? null}
          sort={props.sort ?? null}
          {...(props.onSortChange ? { onSortChange: props.onSortChange } : {})}
          loadingLabel={t.loading}
          emptyLabel={t.empty}
          retryLabel={t.retry}
          {...(props.onRetry ? { onRetry: props.onRetry } : {})}
        />
      </ListContent>
      <ManagementPagination props={props} locale={locale} />
    </ListPanel>
  );
}

function ManagementSearch({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const locale = useShell((state) => state.locale);
  const t = copy[locale];
  return (
    <SearchBar
      value={draft}
      onValueChange={setDraft}
      onSearch={onSearch}
      mode={{ type: 'submit' }}
      label={t.searchLabel}
      searchLabel={t.search}
      clearLabel={t.clear}
      placeholder={t.placeholder}
    />
  );
}

export function managementListState(
  access: 'loading' | 'ready' | 'failed',
  query: 'idle' | 'loading' | 'ready' | 'failed',
) {
  return {
    loading:
      access !== 'failed' && (access === 'loading' || query === 'loading' || query === 'idle'),
    failed: access === 'failed' || query === 'failed',
  };
}

function ManagementPagination<Row>({
  props,
  locale,
}: {
  props: ManagementListProps<Row>;
  locale: 'zh' | 'en';
}) {
  const t = copy[locale];
  const pages = Math.max(1, Math.ceil(props.total / props.pageSize));
  return !props.loading && !props.error ? (
    <ListFooter>
      {props.page > pages ? (
        <Button variant="outline" onClick={() => props.onPageChange(pages)}>
          {locale === 'zh' ? '\u8f6c\u5230\u6709\u6548\u9875' : 'Go to available page'}
        </Button>
      ) : null}
      <Pagination
        page={props.page}
        pageSize={props.pageSize}
        total={props.total}
        onPageChange={props.onPageChange}
        onPageSizeChange={({ pageSize }) => props.onPageSizeChange(pageSize)}
        pageSizeOptions={[10, 20, 50, 100]}
        pageSizeLabel={t.pageSize}
        previousLabel={t.previous}
        nextLabel={t.next}
        pageLabel={
          locale === 'zh' ? `第 ${props.page} / ${pages} 页` : `Page ${props.page} of ${pages}`
        }
        totalLabel={locale === 'zh' ? `共 ${props.total} 条` : `${props.total} records`}
      />
    </ListFooter>
  ) : null;
}
