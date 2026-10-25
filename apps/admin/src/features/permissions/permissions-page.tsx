'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRoundIcon, PlusIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { endpointListSchema, permissionListSchema } from '../../contracts/access';
import type { Endpoint, Permission, Page } from '../../contracts/access';
import type { Collection } from '../../contracts/content';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery, useAllPagesQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { createPermissionColumns } from './permission-columns';
import { PermissionDeleteDialog } from './permission-delete-dialog';
import { PermissionDialog } from './permission-dialog';
import { PermissionFilters } from './permission-filters';
import { parsePermissionQuery, permissionQueryHref } from './permission-query';
import type { PermissionQuery } from './permission-query';
import { RecoveryEntry } from '../endpoints/recovery-entry';
import { permissionMessages } from './permission-messages';

function endpointKey(endpoint: Endpoint) {
  return JSON.stringify([endpoint.operationId, endpoint.scopeKind, endpoint.collectionKey]);
}

export function PermissionsPage() {
  const locale = useShell((state) => state.locale);
  const t = permissionMessages[locale];
  const access = useAccessControl();
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parsePermissionQuery(new URLSearchParams(search));
  const result = useApiQuery({
    operation: 'permissions.list',
    query: { ...query },
    response: permissionListSchema,
    enabled: access.can('permissions.list'),
  });
  const endpoints = useAllPagesQuery({
    operation: 'endpoints.list',
    response: endpointListSchema,
    key: endpointKey,
    enabled: access.can('endpoints.list'),
  });
  const collections = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const [editing, setEditing] = useState<{ permission: Permission | null } | null>(null);
  const [deleting, setDeleting] = useState<Permission | null>(null);
  function change(changes: Partial<PermissionQuery>) {
    router.push(update(changes, permissionQueryHref), { scroll: false });
  }
  const columns = createPermissionColumns({
    t,
    canUpdate: access.can('permissions.update'),
    canDelete: access.can('permissions.delete'),
    edit: (permission) => setEditing({ permission }),
    remove: setDeleting,
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        icon={<KeyRoundIcon />}
        actions={
          access.can('permissions.create') ? (
            <Button onClick={() => setEditing({ permission: null })}>
              <PlusIcon />
              {t.create}
            </Button>
          ) : null
        }
      />
      <ManagementFeedback
        error={result.error}
        onRetry={() => {
          if (access.phase === 'failed') access.refresh();
          else result.reload();
        }}
      />
      <PermissionRecords
        query={query}
        result={result}
        columns={columns}
        collections={collections.error ? null : (collections.data?.rows ?? null)}
        change={change}
      />
      <RecoveryEntry errors={[result.error, endpoints.error]} />
      <ManagementFeedback error={collections.error} onRetry={collections.reload} />
      <ManagementFeedback error={endpoints.error} onRetry={endpoints.reload} />
      {editing ? (
        <PermissionDialog
          permission={editing.permission}
          endpoints={endpoints.error ? null : endpoints.data}
          collections={collections.error ? null : (collections.data?.rows ?? null)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            result.reload();
            endpoints.reload();
          }}
        />
      ) : null}
      {deleting ? (
        <PermissionDeleteDialog
          permission={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            result.reload();
          }}
        />
      ) : null}
    </ClientInteractionBoundary>
  );
}

interface RecordsProps {
  query: PermissionQuery;
  result: ReturnType<typeof useApiQuery<Page<Permission>>>;
  columns: ReturnType<typeof createPermissionColumns>;
  collections: Collection[] | null;
  change: (changes: Partial<PermissionQuery>) => void;
}

function PermissionRecords({ query, result, columns, collections, change }: RecordsProps) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = permissionMessages[locale];
  const tableState = managementListState(access.phase, result.phase);
  if (access.phase === 'ready' && !access.can('permissions.list'))
    return <Banner tone="warning">{t.readDenied}</Banner>;
  return (
    <ManagementList
      columns={columns}
      rows={result.data?.rows ?? []}
      rowKey={(permission) => permission.id}
      page={query.page}
      pageSize={query.pageSize}
      total={result.data?.total ?? 0}
      loading={tableState.loading}
      error={tableState.failed ? t.loadFailed : null}
      query={query.q}
      onSearch={(q) => change({ q })}
      onPageChange={(page) => change({ page })}
      onPageSizeChange={(pageSize) => change({ pageSize })}
      onRetry={() => {
        if (access.phase === 'failed') access.refresh();
        else result.reload();
      }}
      sort={{ key: query.sortBy, direction: query.order }}
      onSortChange={(sort) =>
        change({
          sortBy: sort?.key === 'name' || sort?.key === 'code' ? sort.key : 'createdAt',
          order: sort?.direction ?? 'desc',
        })
      }
      filters={
        <PermissionFilters
          query={query}
          collections={collections}
          change={change}
          locale={locale}
        />
      }
    />
  );
}
