'use client';
import type { Endpoint, Permission } from '../../contracts/access';
import type { Collection } from '../../contracts/content';
import { BindingDialog } from './binding-dialog';
import { BindingDeleteDialog } from './binding-delete-dialog';
import { PermissionDialog } from '../permissions/permission-dialog';
import { PermissionDeleteDialog } from '../permissions/permission-delete-dialog';
import type { BindingTarget } from './binding-read';
import {
  recoveryEndpointSource,
  recoveryPermissionSource,
  recoveryBindingSource,
} from './recovery-read';

export type RecoverySelection =
  | { kind: 'endpoint'; value: Endpoint }
  | { kind: 'binding'; value: BindingTarget }
  | { kind: 'permission'; value: Permission | null }
  | { kind: 'deletePermission'; value: Permission };
export function RecoveryDialogs({
  selection,
  endpoints,
  permissions,
  collections,
  ready,
  close,
  saved,
  reload,
}: {
  selection: RecoverySelection | null;
  endpoints: Endpoint[] | null;
  permissions: Permission[] | null;
  collections: Pick<Collection, 'key' | 'label'>[] | null;
  ready: boolean;
  close: () => void;
  saved: () => void;
  reload: () => void;
}) {
  if (!selection) return null;
  if (selection.kind === 'endpoint')
    return (
      <BindingDialog
        endpoint={selection.value}
        permissions={ready ? permissions : null}
        catalogReady={ready}
        source={recoveryEndpointSource}
        onRetryDependencies={reload}
        onClose={close}
        onSaved={saved}
      />
    );
  if (selection.kind === 'binding')
    return (
      <BindingDeleteDialog
        endpoint={selection.value}
        catalogReady={ready}
        source={recoveryBindingSource}
        onRetryDependencies={reload}
        onClose={close}
        onDeleted={saved}
      />
    );
  if (selection.kind === 'deletePermission')
    return (
      <PermissionDeleteDialog
        permission={selection.value}
        source={{ ...recoveryPermissionSource, ready }}
        onRetryDependencies={reload}
        onClose={close}
        onDeleted={saved}
      />
    );
  return (
    <PermissionDialog
      permission={selection.value}
      endpoints={ready ? endpoints : null}
      collections={collections}
      source={{ ...recoveryPermissionSource, ready }}
      onRetryDependencies={reload}
      onClose={close}
      onSaved={saved}
    />
  );
}
