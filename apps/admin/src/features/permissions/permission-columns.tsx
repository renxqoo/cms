import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Pill } from '@new-cms/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@new-cms/ui/overlays';
import type { Permission } from '../../contracts/access';
import type { permissionMessages } from './permission-messages';

type Labels = { [Key in keyof typeof permissionMessages.en]: string };

export function createPermissionColumns({
  t,
  canUpdate,
  canDelete,
  edit,
  remove,
}: {
  t: Labels;
  canUpdate: boolean;
  canDelete: boolean;
  edit: (permission: Permission) => void;
  remove: (permission: Permission) => void;
}) {
  return [
    {
      key: 'code',
      header: t.code,
      sortable: true,
      cell: (permission: Permission) => (
        <span className="font-mono text-xs">{permission.code}</span>
      ),
    },
    {
      key: 'name',
      header: t.name,
      sortable: true,
      cell: (permission: Permission) => <span className="font-medium">{permission.name}</span>,
    },
    {
      key: 'scope',
      header: t.scope,
      cell: (permission: Permission) =>
        permission.scopeKind === 'global' ? t.global : permission.collectionKey,
    },
    {
      key: 'status',
      header: t.status,
      cell: (permission: Permission) => (
        <Pill tone={permission.status === 'active' ? 'success' : 'warning'}>
          {t[permission.status]}
        </Pill>
      ),
    },
    {
      key: 'actions',
      header: t.actions,
      cell: (permission: Permission) =>
        canUpdate || canDelete ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${t.actions}: ${permission.name}`}
                />
              }
            >
              <MoreHorizontalIcon />
            </MenuTrigger>
            <MenuContent>
              {canUpdate ? <MenuItem onClick={() => edit(permission)}>{t.edit}</MenuItem> : null}
              {canDelete ? (
                <MenuItem tone="destructive" onClick={() => remove(permission)}>
                  {t.remove}
                </MenuItem>
              ) : null}
            </MenuContent>
          </Menu>
        ) : (
          <span>—</span>
        ),
    },
  ];
}
