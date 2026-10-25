'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlusIcon, ShieldCheckIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { permissionListSchema, roleListSchema } from '../../contracts/access';
import type { Permission, RoleListItem } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery, useAllPagesQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { RoleCreateDialog } from './role-create-dialog';
import { RoleDeleteDialog } from './role-delete-dialog';
import { parseRoleQuery, roleQueryHref } from './role-query';
import type { RoleQuery } from './role-query';
import { createRoleColumns } from './role-columns';
import { roleMessages } from './role-messages';

const permissionKey = (permission: Permission) => permission.id;

export function RolesPage() {
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const access = useAccessControl();
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseRoleQuery(new URLSearchParams(search));
  const result = useApiQuery({
    operation: 'roles.list',
    query: { ...query },
    response: roleListSchema,
    enabled: access.can('roles.list'),
  });
  const permissions = useAllPagesQuery({
    operation: 'permissions.list',
    response: permissionListSchema,
    key: permissionKey,
    enabled: access.can('permissions.list'),
  });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleListItem | null>(null);
  function change(changes: Partial<RoleQuery>) {
    router.push(update(changes, roleQueryHref), { scroll: false });
  }
  const tableState = managementListState(access.phase, result.phase);
  const columns = createRoleColumns({
    t,
    canDelete: access.can('roles.delete'),
    open: (id) => router.push(`/dashboard/roles/${id}`),
    remove: setDeleting,
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        icon={<ShieldCheckIcon />}
        actions={
          access.can('roles.create') ? (
            <Button onClick={() => setCreating(true)}>
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
      {access.phase === 'ready' && !access.can('roles.list') ? (
        <Banner tone="warning">{t.readDenied}</Banner>
      ) : (
        <ManagementList
          columns={columns}
          rows={result.data?.rows ?? []}
          rowKey={(role) => role.id}
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
        />
      )}
      {creating ? (
        <RoleCreateDialog
          permissions={permissions.error ? null : permissions.data}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            result.reload();
          }}
        />
      ) : null}
      {deleting ? (
        <RoleDeleteDialog
          role={deleting}
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
