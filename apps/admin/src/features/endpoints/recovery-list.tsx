'use client';
import { useState } from 'react';
import type { DataTableColumn } from '@new-cms/ui/data';
import { useShell } from '../../components/shell/shell-provider';
import type { ApiFailure } from '../management-shared/query';
import { ManagementList } from '../management-shared/management-list';
import { ManagementFeedback } from '../management-shared/feedback';
import { recoveryMessages } from './recovery-messages';

export function RecoveryList<Row>({
  title,
  result,
  columns,
  rowKey,
  text,
}: {
  title: string;
  result: {
    phase: 'idle' | 'loading' | 'ready' | 'failed';
    data: Row[] | null;
    error: ApiFailure | null;
    reload: () => void;
  };
  columns: readonly DataTableColumn<Row>[];
  rowKey: (row: Row) => string;
  text: (row: Row) => string;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const t = recoveryMessages[useShell((state) => state.locale)];
  const filtered = (result.data ?? []).filter((row) =>
    text(row).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      <ManagementList
        columns={columns}
        rows={filtered.slice((page - 1) * pageSize, page * pageSize)}
        rowKey={rowKey}
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        loading={result.phase === 'loading' || result.phase === 'idle'}
        error={result.phase === 'failed' ? t.loadFailed : null}
        onRetry={result.reload}
        query={query}
        onSearch={(next) => {
          setQuery(next);
          setPage(1);
        }}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </section>
  );
}
