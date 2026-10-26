'use client';

import { DataTable } from '@new-cms/ui/data';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { jobResultSchema, uploadSessionSchema } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetMessages } from '../assets/messages';
import { usePolledQuery } from './use-polled-query';
import { assetWorkPolicy } from './policy';
import { PollingFeedback } from './polling-feedback';
import { assetDate, workAction, workStatus } from './work-copy';

function DetailValues({ values }: { values: readonly (readonly [string, string | number])[] }) {
  return (
    <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      {values.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function JobDetails({ collection, id }: { collection: string; id: string }) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const allowed = useAccessControl().can('content.getJob', {
    scopeKind: 'collection',
    collectionKey: collection,
  });
  const query = usePolledQuery({
    enabled: allowed,
    operation: 'content.getJob',
    params: { collection, jobId: id },
    response: jobResultSchema,
    intervalMs: assetWorkPolicy.detailPollMs,
    terminal: (job) => !['queued', 'running'].includes(job.status),
  });
  const { data } = query;
  if (!allowed) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <div className="space-y-4">
      <ManagementFeedback error={query.error} onRetry={query.reload} />
      <PollingFeedback {...query} onResume={query.reload} />
      {data ? (
        <>
          <DetailValues
            values={[
              [t.jobId, data.id],
              [t.collection, data.collection],
              [t.action, workAction(data.action, t)],
              [t.status, workStatus(data.status, t)],
              ...('kind' in data
                ? ([
                    [t.total, data.total],
                    [t.successCount, data.succeeded],
                    [t.failureCount, data.failed],
                    [t.executeAt, assetDate(data.executeAt, locale)],
                  ] as const)
                : ([
                    [t.attempts, data.attempts],
                    [t.failureCode, data.failureCode ?? '—'],
                  ] as const)),
            ]}
          />
          {'kind' in data ? (
            <DataTable
              rows={data.items}
              rowKey={(item) => String(item.position)}
              columns={[
                { key: 'id', header: t.documentId, cell: (item) => item.id },
                { key: 'status', header: t.status, cell: (item) => workStatus(item.status, t) },
                { key: 'error', header: t.failureCode, cell: (item) => item.error?.code ?? '—' },
              ]}
              emptyLabel={t.empty}
              loadingLabel={t.loading}
              retryLabel={t.retry}
            />
          ) : null}
        </>
      ) : query.phase !== 'failed' ? (
        <p role="status">{t.loading}</p>
      ) : null}
    </div>
  );
}

export function UploadDetails({ collection, id }: { collection: string; id: string }) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const navigation = useAppNavigation();
  const allowed = useAccessControl().can('assets.readUpload', {
    scopeKind: 'collection',
    collectionKey: collection,
  });
  const query = usePolledQuery({
    enabled: allowed,
    operation: 'assets.readUpload',
    params: { collection, uploadId: id },
    response: uploadSessionSchema,
    intervalMs: assetWorkPolicy.uploadPollMs,
    terminal: (session) => !['pending', 'uploading', 'processing'].includes(session.status),
  });
  const { data } = query;
  if (!allowed) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <div className="space-y-4">
      <ManagementFeedback error={query.error} onRetry={query.reload} />
      <PollingFeedback {...query} onResume={query.reload} />
      {data ? (
        <>
          <DetailValues
            values={[
              [t.uploadId, data.id],
              [t.filename, data.filename],
              [t.status, workStatus(data.status, t)],
              [t.bytes, data.declaredBytes],
              [t.mimeType, data.declaredMimeType],
              [t.expires, assetDate(data.expiresAt, locale)],
              [t.failureCode, data.failureCode ?? '—'],
            ]}
          />
          {data.status === 'ready' ? <Banner>{t.readyNotice}</Banner> : null}
          {data.status === 'ready' && data.purpose === 'create' ? (
            <Button
              onClick={() =>
                navigation.push(`/dashboard/collections/${collection}/new?uploadId=${data.id}`)
              }
            >
              {t.createDocument}
            </Button>
          ) : null}
          {data.documentId ? (
            <Button
              variant="outline"
              onClick={() =>
                navigation.push(`/dashboard/collections/${collection}/${data.documentId}`)
              }
            >
              {t.openDocument}
            </Button>
          ) : null}
        </>
      ) : query.phase !== 'failed' ? (
        <p role="status">{t.loading}</p>
      ) : null}
    </div>
  );
}
