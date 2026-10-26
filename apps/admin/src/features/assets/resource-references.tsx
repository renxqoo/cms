'use client';

import { useState } from 'react';
import type { DataTableColumn } from '@new-cms/ui/data';
import type { ResourceReference } from '../../contracts/assets';
import type { AssetMessages } from './messages';
import { Banner } from '@new-cms/ui/feedback';
import { Button } from '@new-cms/ui/actions';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { resourceReferencePageSchema } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList } from '../management-shared/management-list';
import { assetMessages } from './messages';

export function ResourceReferences({ collection, id }: { collection: string; id: string }) {
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const t = assetMessages[useShell((state) => state.locale)];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const result = useApiQuery({
    operation: 'resources.references',
    params: { collection, id },
    query: { page, pageSize },
    response: resourceReferencePageSchema,
    enabled: access.can('resources.references', {
      scopeKind: 'collection',
      collectionKey: collection,
    }),
  });
  if (!access.can('resources.references', { scopeKind: 'collection', collectionKey: collection }))
    return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <div className="space-y-3">
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      <ManagementList
        rows={result.data?.rows ?? []}
        rowKey={(row) => `${row.collection}/${row.id}/${row.versionId}/${row.sourcePath}`}
        columns={referenceColumns(t, (row) =>
          navigation.push(`/dashboard/collections/${row.collection}/${row.id}`),
        )}
        page={page}
        pageSize={pageSize}
        total={result.data?.total ?? 0}
        loading={result.phase === 'loading' || result.phase === 'idle'}
        error={result.error ? t.failed : null}
        onRetry={result.reload}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </div>
  );
}

function referenceColumns(
  t: AssetMessages,
  open: (row: ResourceReference) => void,
): DataTableColumn<ResourceReference>[] {
  return [
    { key: 'collection', header: t.collection, cell: (row) => row.collection },
    {
      key: 'id',
      header: t.documentId,
      cell: (row) => (
        <Button
          variant="link"
          className="max-w-52 whitespace-normal break-all"
          onClick={() => open(row)}
        >
          {row.id}
        </Button>
      ),
    },
    { key: 'versionId', header: t.version, cell: (row) => row.versionId },
    { key: 'sourcePath', header: t.item, cell: (row) => row.sourcePath },
  ];
}
