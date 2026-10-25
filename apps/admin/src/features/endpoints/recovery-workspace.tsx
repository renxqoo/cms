'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import {
  recoveryEndpointListSchema,
  recoveryBindingListSchema,
  recoveryPermissionListSchema,
} from '../../contracts/access';
import type { Binding, Endpoint, Permission } from '../../contracts/access';
import { collectionListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useAllPagesQuery, useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { createPermissionColumns } from '../permissions/permission-columns';
import { permissionMessages } from '../permissions/permission-messages';
import { createEndpointColumns } from './endpoint-columns';
import { endpointMessages } from './endpoint-messages';
import { endpointKey } from './endpoint-model';
import { recoveryBindingKey, recoveryPermissionKey } from './recovery-read';
import { RecoveryDialogs } from './recovery-dialogs';
import type { RecoverySelection } from './recovery-dialogs';
import { RecoveryList } from './recovery-list';
import { createRecoveryBindingColumns } from './recovery-columns';
import { recoveryMessages } from './recovery-messages';

export function RecoveryWorkspace({ enabled }: { enabled: boolean }) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = recoveryMessages[locale];
  const endpoints = useAllPagesQuery({
    operation: 'access.readRecovery',
    query: { resource: 'endpoints' },
    response: recoveryEndpointListSchema,
    key: endpointKey,
    enabled,
  });
  const permissions = useAllPagesQuery({
    operation: 'access.readRecovery',
    query: { resource: 'permissions' },
    response: recoveryPermissionListSchema,
    key: recoveryPermissionKey,
    enabled,
  });
  const bindings = useAllPagesQuery({
    operation: 'access.readRecovery',
    query: { resource: 'bindings' },
    response: recoveryBindingListSchema,
    key: recoveryBindingKey,
    enabled,
  });
  const collections = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: enabled && access.can('collections.list'),
  });
  const [selection, setSelection] = useState<RecoverySelection | null>(null);
  const ready =
    enabled &&
    endpoints.phase === 'ready' &&
    permissions.phase === 'ready' &&
    bindings.phase === 'ready';
  function reload() {
    endpoints.reload();
    permissions.reload();
    bindings.reload();
    collections.reload();
  }
  function saved() {
    setSelection(null);
    reload();
  }
  const endpointColumns = createEndpointColumns({
    t: endpointMessages[locale],
    permissions: permissions.data,
    canCreate: access.can('endpoints.createBinding'),
    canUpdate: access.can('endpoints.updateBinding'),
    canDelete: access.can('endpoints.deleteBinding'),
    catalogReady: ready,
    edit: (value) => setSelection({ kind: 'endpoint', value }),
    remove: (value) => setSelection({ kind: 'binding', value }),
  });
  const permissionColumns = createPermissionColumns({
    t: permissionMessages[locale],
    canUpdate: ready && access.can('permissions.update'),
    canDelete: ready && access.can('permissions.delete'),
    edit: (value) => setSelection({ kind: 'permission', value }),
    remove: (value) => setSelection({ kind: 'deletePermission', value }),
  });
  const bindingColumns = createRecoveryBindingColumns({
    endpoints: endpoints.data,
    ready,
    canDelete: access.can('endpoints.deleteBinding'),
    locale,
    remove: (value) => setSelection({ kind: 'binding', value }),
  });
  return (
    <div className="space-y-6">
      {!ready ? <Banner tone="warning">{t.unavailable}</Banner> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!enabled} onClick={reload}>
          {t.refresh}
        </Button>
        <Button
          disabled={!ready || !access.can('permissions.create')}
          onClick={() => setSelection({ kind: 'permission', value: null })}
        >
          {t.create}
        </Button>
      </div>
      <RecoveryList
        title={t.endpoints}
        result={endpoints}
        columns={endpointColumns}
        rowKey={endpointKey}
        text={(row: Endpoint) => `${row.operationId} ${row.collectionKey ?? ''} ${row.path}`}
      />
      <RecoveryList
        title={t.permissions}
        result={permissions}
        columns={permissionColumns}
        rowKey={recoveryPermissionKey}
        text={(row: Permission) => `${row.code} ${row.name} ${row.collectionKey ?? ''}`}
      />
      <RecoveryList
        title={t.bindings}
        result={bindings}
        columns={bindingColumns}
        rowKey={recoveryBindingKey}
        text={(row: Binding) =>
          `${row.operationId} ${row.id} ${row.permissionId} ${row.collectionKey ?? ''}`
        }
      />
      <ManagementFeedback error={collections.error} onRetry={collections.reload} />
      <RecoveryDialogs
        reload={reload}
        selection={selection}
        endpoints={endpoints.data}
        permissions={permissions.data}
        collections={collections.phase === 'ready' ? (collections.data?.rows ?? null) : null}
        ready={ready}
        close={() => setSelection(null)}
        saved={saved}
      />
    </div>
  );
}
