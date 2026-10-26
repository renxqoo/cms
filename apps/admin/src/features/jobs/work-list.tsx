'use client';

import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { jobSummaryPageSchema, uploadPageSchema } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { assetMessages } from '../assets/messages';
import { jobColumns, uploadColumns } from './work-columns';
import type { WorkQuery } from './query';
import { workFilters } from './query';
import { usePolledQuery } from './use-polled-query';
import { assetWorkPolicy } from './policy';
import { PollingFeedback } from './polling-feedback';

interface WorkListProps {
  query: WorkQuery;
  onChange: (changes: Partial<WorkQuery>) => void;
}

export function JobsList({ query, onChange }: WorkListProps) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const allowed = access.can('content.listJobs', {
    scopeKind: 'collection',
    collectionKey: query.collection,
  });
  const result = usePolledQuery({
    operation: 'content.listJobs',
    params: { collection: query.collection },
    query: workFilters(query),
    response: jobSummaryPageSchema,
    enabled: allowed,
    intervalMs: assetWorkPolicy.listPollMs,
    terminal: (page) => page.rows.every((row) => !['queued', 'running'].includes(row.status)),
  });
  if (!allowed) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <div className="space-y-3">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      <PollingFeedback {...result} onResume={result.reload} />
      <ManagementList
        columns={jobColumns({
          t,
          locale,
          open: (selected) => onChange({ selected, page: query.page }),
        })}
        rows={result.data?.rows ?? []}
        rowKey={(row) => row.id}
        page={query.page}
        pageSize={query.pageSize}
        total={result.data?.total ?? 0}
        loading={result.phase === 'loading' || result.phase === 'idle'}
        error={result.error ? t.failed : null}
        onRetry={result.reload}
        onPageChange={(page) => onChange({ page })}
        onPageSizeChange={(pageSize) => onChange({ pageSize })}
      />
    </div>
  );
}

export function UploadsList({ query, onChange }: WorkListProps) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const allowed = access.can('assets.listUploads', {
    scopeKind: 'collection',
    collectionKey: query.collection,
  });
  const result = usePolledQuery({
    operation: 'assets.listUploads',
    params: { collection: query.collection },
    query: workFilters(query),
    response: uploadPageSchema,
    enabled: allowed,
    intervalMs: assetWorkPolicy.listPollMs,
    terminal: (page) =>
      page.rows.every((row) => !['pending', 'uploading', 'processing'].includes(row.status)),
  });
  if (!allowed) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <div className="space-y-3">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      <PollingFeedback {...result} onResume={result.reload} />
      <ManagementList
        columns={uploadColumns({
          t,
          locale,
          open: (selected) => onChange({ selected, page: query.page }),
        })}
        rows={result.data?.rows ?? []}
        rowKey={(row) => row.id}
        page={query.page}
        pageSize={query.pageSize}
        total={result.data?.total ?? 0}
        loading={result.phase === 'loading' || result.phase === 'idle'}
        error={result.error ? t.failed : null}
        onRetry={result.reload}
        onPageChange={(page) => onChange({ page })}
        onPageSizeChange={(pageSize) => onChange({ pageSize })}
      />
    </div>
  );
}
