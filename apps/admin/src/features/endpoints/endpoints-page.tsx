'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NetworkIcon } from 'lucide-react';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { endpointListSchema, permissionListSchema } from '../../contracts/access';
import type { Endpoint, Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery, useAllPagesQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { RecoveryEntry } from './recovery-entry';
import { BindingDialog } from './binding-dialog';
import { BindingDeleteDialog } from './binding-delete-dialog';
import { createEndpointColumns } from './endpoint-columns';
import { EndpointFilters } from './endpoint-filters';
import { endpointKey, parseEndpointQuery, endpointQueryHref } from './endpoint-model';
import type { EndpointQuery } from './endpoint-model';
import { endpointMessages } from './endpoint-messages';

function permissionKey(permission: Permission) {
  return permission.id;
}

export function EndpointsPage() {
  const locale = useShell((state) => state.locale);
  const t = endpointMessages[locale];
  const access = useAccessControl();
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseEndpointQuery(new URLSearchParams(search));
  const result = useApiQuery({
    operation: 'endpoints.list',
    query: { ...query },
    response: endpointListSchema,
    enabled: access.can('endpoints.list'),
  });
  const catalog = useAllPagesQuery({
    operation: 'endpoints.list',
    response: endpointListSchema,
    key: endpointKey,
    enabled: access.can('endpoints.list'),
  });
  const permissions = useAllPagesQuery({
    operation: 'permissions.list',
    response: permissionListSchema,
    key: permissionKey,
    enabled: access.can('permissions.list'),
  });
  const [editing, setEditing] = useState<Endpoint | null>(null);
  const [deleting, setDeleting] = useState<Endpoint | null>(null);
  const ready = catalog.phase === 'ready' && permissions.phase === 'ready';
  function change(changes: Partial<EndpointQuery>) {
    router.push(update(changes, endpointQueryHref), { scroll: false });
  }
  function saved() {
    setEditing(null);
    setDeleting(null);
    result.reload();
    catalog.reload();
  }
  const tableState = managementListState(access.phase, result.phase);
  const columns = createEndpointColumns({
    t,
    permissions: permissions.error ? null : permissions.data,
    canCreate: access.can('endpoints.createBinding'),
    canUpdate: access.can('endpoints.updateBinding'),
    canDelete: access.can('endpoints.deleteBinding'),
    catalogReady: ready,
    edit: setEditing,
    remove: setDeleting,
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader title={t.title} description={t.description} icon={<NetworkIcon />} />
      <ManagementFeedback
        error={result.error}
        onRetry={() => {
          if (access.phase === 'failed') access.refresh();
          else result.reload();
        }}
      />
      {access.phase === 'ready' && !access.can('endpoints.list') ? (
        <Banner tone="warning">{t.readDenied}</Banner>
      ) : (
        <ManagementList
          columns={columns}
          rows={result.data?.rows ?? []}
          rowKey={endpointKey}
          page={query.page}
          pageSize={query.pageSize}
          total={result.data?.total ?? 0}
          loading={tableState.loading}
          error={tableState.failed ? t.loadFailed : null}
          onPageChange={(page) => change({ page })}
          onPageSizeChange={(pageSize) => change({ pageSize })}
          onRetry={() => {
            if (access.phase === 'failed') access.refresh();
            else result.reload();
          }}
          filters={
            <EndpointFilters
              key={`${query.module}:${query.accessKind}`}
              query={query}
              change={change}
              locale={locale}
            />
          }
        />
      )}
      <RecoveryEntry errors={[result.error, catalog.error, permissions.error]} />
      <ManagementFeedback error={catalog.error} onRetry={catalog.reload} />
      <ManagementFeedback error={permissions.error} onRetry={permissions.reload} />
      {editing ? (
        <BindingDialog
          endpoint={editing}
          permissions={permissions.error ? null : permissions.data}
          catalogReady={ready}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}
      {deleting ? (
        <BindingDeleteDialog
          endpoint={deleting}
          catalogReady={ready}
          onClose={() => setDeleting(null)}
          onDeleted={saved}
        />
      ) : null}
    </ClientInteractionBoundary>
  );
}
