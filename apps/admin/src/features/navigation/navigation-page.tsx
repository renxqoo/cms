'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RouteIcon, PlusIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { navigationListSchema, permissionListSchema } from '../../contracts/access';
import type { NavigationNode, Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery, useAllPagesQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { ManagementList, managementListState } from '../management-shared/management-list';
import { createNavigationColumns } from './navigation-columns';
import { NavigationDialog } from './navigation-dialog';
import { NavigationDeleteDialog } from './navigation-delete-dialog';
import { flattenNavigation } from './navigation-model';
import { parseNavigationQuery, navigationQueryHref } from './navigation-query';
import { navigationMessages } from './navigation-messages';

function permissionKey(permission: Permission) {
  return permission.id;
}

export function NavigationPage() {
  const locale = useShell((state) => state.locale);
  const t = navigationMessages[locale];
  const access = useAccessControl();
  const router = useAppNavigation();
  const params = useSearchParams();
  const [search, update] = useQueryNavigation(params.toString());
  const query = parseNavigationQuery(new URLSearchParams(search));
  const result = useApiQuery({
    operation: 'navigation.list',
    response: navigationListSchema,
    enabled: access.can('navigation.list'),
  });
  const permissions = useAllPagesQuery({
    operation: 'permissions.list',
    response: permissionListSchema,
    key: permissionKey,
    enabled: access.can('permissions.list'),
  });
  const [editing, setEditing] = useState<{ node: NavigationNode | null } | null>(null);
  const [deleting, setDeleting] = useState<NavigationNode | null>(null);
  const nodes = flattenNavigation(result.data?.rows ?? []);
  const matching = nodes.filter(({ node }) =>
    `${node.name} ${node.path ?? ''}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()),
  );
  const page = Math.min(query.page, Math.max(1, Math.ceil(matching.length / query.pageSize)));
  const rows = matching.slice((page - 1) * query.pageSize, page * query.pageSize);
  function change(changes: Partial<typeof query>) {
    router.push(update(changes, navigationQueryHref), { scroll: false });
  }
  const tableState = managementListState(access.phase, result.phase);
  const columns = createNavigationColumns({
    t,
    canUpdate: access.can('navigation.update'),
    canDelete: access.can('navigation.delete'),
    edit: (node) => setEditing({ node }),
    remove: setDeleting,
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        icon={<RouteIcon />}
        actions={
          access.can('navigation.create') ? (
            <Button onClick={() => setEditing({ node: null })}>
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
      {access.phase === 'ready' && !access.can('navigation.list') ? (
        <Banner tone="warning">{t.readDenied}</Banner>
      ) : (
        <ManagementList
          columns={columns}
          rows={rows}
          rowKey={({ node }) => node.id}
          page={page}
          pageSize={query.pageSize}
          total={matching.length}
          loading={tableState.loading}
          error={tableState.failed ? t.loadFailed : null}
          query={query.q}
          onSearch={(q) => change({ q })}
          onPageChange={(value) => change({ page: value })}
          onPageSizeChange={(pageSize) => change({ pageSize })}
          onRetry={() => {
            if (access.phase === 'failed') access.refresh();
            else result.reload();
          }}
        />
      )}
      <ManagementFeedback error={permissions.error} onRetry={permissions.reload} />
      {editing ? (
        <NavigationDialog
          node={editing.node}
          nodes={result.phase === 'ready' ? nodes : null}
          permissions={permissions.error ? null : permissions.data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            result.reload();
          }}
        />
      ) : null}
      {deleting ? (
        <NavigationDeleteDialog
          node={deleting}
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
