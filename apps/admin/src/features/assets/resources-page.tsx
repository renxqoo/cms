'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ImageIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import type { DataTableColumn } from '@new-cms/ui/data';
import { documentPageSchema } from '../../contracts/documents';
import type { Document } from '../../contracts/documents';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { ManagementFeedback } from '../management-shared/feedback';
import { assetMessages } from './asset-messages';
import { resourceQuery, resourceHref } from './resource-query';
import { ResourcePreview } from './resource-preview';
import { ResourceUploads } from './resource-uploads';
import type { AssetMessages } from './asset-messages';

export function ResourcesPage() {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const current = new URLSearchParams(search);
  const query = resourceQuery(current);
  const resources = useApiQuery({
    operation: 'resources.list',
    query,
    response: documentPageSchema,
    enabled: access.can('resources.list'),
  });
  const [preview, setPreview] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const state = managementListState(access.phase, resources.phase);
  function change(changes: Readonly<Record<string, string | number | boolean | undefined>>) {
    navigation.push(update(changes, resourceHref), { scroll: false });
  }
  const columns = resourceColumns({
    t,
    preview: setPreview,
    open: (row) => navigation.push(`/dashboard/collections/${row.collection}/${row.id}`),
  });
  return (
    <UnsavedChangesGuard
      dirty={uploading}
      navigation={navigation.adapter}
      labels={{
        title: t.leaveTitle,
        description: t.leaveDescription,
        confirm: t.leave,
        cancel: t.stay,
        close: t.close,
      }}
    >
      <ClientInteractionBoundary className="space-y-6">
        <PageHeader title={t.title} description={t.description} icon={<ImageIcon />} />
        <ManagementFeedback error={resources.error} onRetry={resources.reload} />
        {access.phase === 'ready' && !access.can('resources.list') ? (
          <Banner tone="warning">{t.denied}</Banner>
        ) : (
          <ManagementList
            columns={columns}
            rows={resources.data?.rows ?? []}
            rowKey={(row) => `${row.collection}:${row.id}`}
            page={query.page}
            pageSize={query.pageSize}
            total={resources.data?.total ?? 0}
            loading={state.loading}
            error={state.failed ? t.failed : null}
            query={query.q}
            onSearch={(q) => change({ q })}
            onPageChange={(page) => change({ page })}
            onPageSizeChange={(pageSize) => change({ pageSize })}
            onRetry={resources.reload}
          />
        )}
        <ResourceUploads search={search} onBusyChange={setUploading} change={change} />
        {preview ? (
          <ResourcePreview
            key={`${preview.collection}:${preview.id}:${preview.versionId}`}
            document={preview}
            onClose={() => setPreview(null)}
          />
        ) : null}
      </ClientInteractionBoundary>
    </UnsavedChangesGuard>
  );
}

function resourceColumns(input: {
  t: AssetMessages;
  preview: (row: Document) => void;
  open: (row: Document) => void;
}): DataTableColumn<Document>[] {
  const { t } = input;
  return [
    {
      key: 'filename',
      header: t.name,
      cell: (row) => <span className="break-all">{row.file?.filename ?? row.id}</span>,
    },
    { key: 'collection', header: t.collectionColumn, cell: (row) => row.collection },
    { key: 'bytes', header: t.bytes, cell: (row) => row.file?.bytes.toLocaleString() ?? '—' },
    { key: 'revision', header: t.revision, cell: (row) => row.revision },
    {
      key: 'actions',
      header: t.actions,
      cell: (row) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => input.preview(row)}>
            {t.preview}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => input.open(row)}>
            {t.open}
          </Button>
        </div>
      ),
    },
  ];
}
