'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClockIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { collectionListSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import {
  jobActionSchema,
  jobPageSchema,
  jobStatusSchema,
  uploadPageSchema,
} from '../../contracts/jobs';
import type { JobSummary, UploadSummary } from '../../contracts/jobs';
import { uploadSessionSchema } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { activeJob, activeUpload, discoveryPolicy } from './policy';
import { jobsApiQuery, jobsQueryHref, parseJobsQuery } from './query';
import type { JobsQuery } from './query';
import { usePollingQuery } from './use-polling-query';
import { workMessages, workStatus } from './messages';
import type { WorkMessages } from './messages';
import { WorkDetail } from './work-detail';
import type { SelectedWork } from './work-detail';
import { PollingFeedback } from './polling-feedback';
import { createJobColumns, createUploadColumns } from './columns';
import { z } from 'zod';

const pendingJobs = (data: { rows: readonly JobSummary[] }) =>
  data.rows.some((row) => activeJob(row.status));
const pendingUploads = (data: { rows: readonly UploadSummary[] }) =>
  data.rows.some((row) => activeUpload(row.status));

function workCollections(rows: readonly Collection[] | undefined, query: JobsQuery) {
  const collections = rows?.filter((item) => query.tab !== 'uploads' || item.upload) ?? [];
  const collection = query.collection
    ? (collections.find((item) => item.key === query.collection)?.key ?? '')
    : (collections[0]?.key ?? '');
  return { collections, collection };
}

function uploadCollection(rows: readonly Collection[] | undefined, current: string) {
  const uploads = rows?.filter((item) => item.upload) ?? [];
  return uploads.find((item) => item.key === current)?.key ?? uploads[0]?.key ?? '';
}

export function JobsPage() {
  const locale = useShell((state) => state.locale);
  const t = workMessages[locale];
  const access = useAccessControl();
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseJobsQuery(new URLSearchParams(search));
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const { collections, collection } = workCollections(catalog.data?.rows, query);
  function change(changes: Readonly<Record<string, string | number | undefined>>) {
    router.push(update({ collection, ...changes }, jobsQueryHref), { scroll: false });
  }
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<ClockIcon />} />
      <ManagementFeedback
        error={catalog.error ?? access.error}
        onRetry={access.phase === 'failed' ? access.refresh : catalog.reload}
      />
      {access.phase !== 'ready' ? (
        <Banner>{access.phase === 'loading' ? t.accessLoading : t.accessFailed}</Banner>
      ) : !access.can('collections.list') ? (
        <Banner tone="warning">{t.denied}</Banner>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field id="work-collection" label={t.collection}>
              <NativeSelect
                value={collection}
                onChange={(event) => change({ collection: event.target.value, locale: undefined })}
                className="w-full sm:min-w-48"
              >
                <option value="">{t.chooseCollection}</option>
                {collections.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="work-locale" label={t.locale}>
              <NativeSelect
                value={query.locale ?? ''}
                onChange={(event) => change({ locale: event.target.value })}
              >
                <option value="">{t.defaultLocale}</option>
                {(collections.find((item) => item.key === collection)?.locales ?? []).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </NativeSelect>
            </Field>
            <div className="flex gap-2" aria-label={t.kind}>
              <Button
                variant={query.tab === 'jobs' ? 'default' : 'outline'}
                aria-pressed={query.tab === 'jobs'}
                onClick={() => change({ tab: 'jobs', status: undefined, purpose: undefined })}
              >
                {t.jobs}
              </Button>
              <Button
                variant={query.tab === 'uploads' ? 'default' : 'outline'}
                aria-pressed={query.tab === 'uploads'}
                onClick={() =>
                  change({
                    tab: 'uploads',
                    collection: uploadCollection(catalog.data?.rows, collection),
                    status: undefined,
                    action: undefined,
                    locale: undefined,
                  })
                }
              >
                {t.uploads}
              </Button>
            </div>
          </div>
          {collection ? (
            <WorkList
              key={JSON.stringify([access.principal.id, collection, search])}
              query={{ ...query, collection }}
              change={change}
            />
          ) : catalog.phase === 'ready' ? (
            <Banner>{t.noCollections}</Banner>
          ) : null}
        </>
      )}
    </ClientInteractionBoundary>
  );
}

function WorkList({
  query,
  change,
}: {
  query: JobsQuery;
  change: (changes: Readonly<Record<string, string | number | undefined>>) => void;
}) {
  return query.tab === 'jobs' ? (
    <JobList query={query} change={change} />
  ) : (
    <UploadList query={query} change={change} />
  );
}

function WorkFilters({
  query,
  change,
  t,
}: {
  query: JobsQuery;
  change: (changes: Readonly<Record<string, string | number | undefined>>) => void;
  t: WorkMessages;
}) {
  const [documentId, setDocumentId] = useState(query.documentId ?? '');
  const [invalid, setInvalid] = useState(false);
  const statuses =
    query.tab === 'jobs' ? jobStatusSchema.options : uploadSessionSchema.shape.status.options;
  return (
    <div className="flex w-full flex-wrap items-end gap-3">
      <Field id="work-status" label={t.status}>
        <NativeSelect
          value={query.tab === 'jobs' ? (query.jobStatus ?? '') : (query.uploadStatus ?? '')}
          onChange={(event) => change({ status: event.target.value })}
        >
          <option value="">{t.all}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {workStatus(status, t)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {query.tab === 'jobs' ? (
        <Field id="work-action" label={t.action}>
          <NativeSelect
            value={query.action ?? ''}
            onChange={(event) => change({ action: event.target.value })}
          >
            <option value="">{t.all}</option>
            {jobActionSchema.options.map((action) => (
              <option key={action} value={action}>
                {t[action]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <Field id="work-purpose" label={t.purpose}>
          <NativeSelect
            value={query.purpose ?? ''}
            onChange={(event) => change({ purpose: event.target.value })}
          >
            <option value="">{t.all}</option>
            <option value="create">{t.create}</option>
            <option value="replace">{t.replace}</option>
          </NativeSelect>
        </Field>
      )}
      <form
        className="flex max-w-full flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (documentId && !z.uuid().safeParse(documentId).success) setInvalid(true);
          else {
            setInvalid(false);
            change({ documentId });
          }
        }}
      >
        <Field
          id="work-document"
          label={t.document}
          error={invalid ? t.invalidDocument : undefined}
        >
          <Input value={documentId} onChange={(event) => setDocumentId(event.target.value)} />
        </Field>
        <Button type="submit" variant="outline">
          {t.apply}
        </Button>
        {query.documentId ? (
          <Button type="button" variant="ghost" onClick={() => change({ documentId: undefined })}>
            {t.clear}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

function JobList({
  query,
  change,
}: {
  query: JobsQuery;
  change: (changes: Readonly<Record<string, string | number | undefined>>) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = workMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection' as const, collectionKey: query.collection };
  const allowed = access.can('content.listJobs', scope);
  const result = usePollingQuery({
    operation: 'content.listJobs',
    params: { collection: query.collection },
    query: jobsApiQuery(query),
    response: jobPageSchema,
    enabled: allowed,
    intervalMs: discoveryPolicy.listIntervalMs,
    active: pendingJobs,
  });
  const [selected, setSelected] = useState<SelectedWork | null>(() =>
    query.jobId
      ? {
          kind: 'job',
          value: {
            id: query.jobId,
            collection: query.collection,
            status: 'queued',
            ...(query.locale ? { locale: query.locale } : {}),
          },
        }
      : null,
  );
  if (!allowed) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <>
      <PollingFeedback
        expired={result.expired}
        observing={result.observing}
        resume={result.resume}
      />
      <ManagementFeedback error={result.error} onRetry={result.resume} />
      <ManagementList
        columns={createJobColumns({
          t,
          locale,
          canRead: access.can('content.getJob', scope),
          open: (row) =>
            setSelected({
              kind: 'job',
              value: {
                ...row,
                locale: row.kind === 'content' ? (row.locale ?? query.locale) : query.locale,
              },
            }),
        })}
        rows={result.data?.rows ?? []}
        rowKey={(row) => row.id}
        page={query.page}
        pageSize={query.pageSize}
        total={result.data?.total ?? 0}
        loading={result.phase === 'loading' || (result.phase === 'idle' && result.data === null)}
        error={result.error ? t.loadFailed : null}
        onRetry={result.resume}
        onPageChange={(page) => change({ page })}
        onPageSizeChange={(pageSize) => change({ pageSize })}
        filters={<WorkFilters query={query} change={change} t={t} />}
      />
      {selected ? (
        <WorkDetail
          selected={selected}
          onClose={() => setSelected(null)}
          onChanged={result.resume}
        />
      ) : null}
    </>
  );
}

function UploadList({
  query,
  change,
}: {
  query: JobsQuery;
  change: (changes: Readonly<Record<string, string | number | undefined>>) => void;
}) {
  const locale = useShell((state) => state.locale);
  const t = workMessages[locale];
  const access = useAccessControl();
  const scope = { scopeKind: 'collection' as const, collectionKey: query.collection };
  const allowed = access.can('assets.listUploads', scope);
  const result = usePollingQuery({
    operation: 'assets.listUploads',
    params: { collection: query.collection },
    query: jobsApiQuery(query),
    response: uploadPageSchema,
    enabled: allowed,
    intervalMs: discoveryPolicy.listIntervalMs,
    active: pendingUploads,
  });
  const [selected, setSelected] = useState<SelectedWork | null>(null);
  if (!allowed) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <>
      <PollingFeedback
        expired={result.expired}
        observing={result.observing}
        resume={result.resume}
      />
      <ManagementFeedback error={result.error} onRetry={result.resume} />
      <ManagementList
        columns={createUploadColumns({
          t,
          locale,
          canRead: access.can('assets.readUpload', scope),
          open: (row) => setSelected({ kind: 'upload', value: row }),
        })}
        rows={result.data?.rows ?? []}
        rowKey={(row) => row.id}
        page={query.page}
        pageSize={query.pageSize}
        total={result.data?.total ?? 0}
        loading={result.phase === 'loading' || (result.phase === 'idle' && result.data === null)}
        error={result.error ? t.loadFailed : null}
        onRetry={result.resume}
        onPageChange={(page) => change({ page })}
        onPageSizeChange={(pageSize) => change({ pageSize })}
        filters={<WorkFilters query={query} change={change} t={t} />}
      />
      {selected ? (
        <WorkDetail
          selected={selected}
          onClose={() => setSelected(null)}
          onChanged={result.resume}
        />
      ) : null}
    </>
  );
}
