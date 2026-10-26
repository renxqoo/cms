import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Pill } from '@new-cms/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@new-cms/ui/overlays';
import { AppLink } from '../../components/shell/navigation/app-link';
import type { RoleListItem } from '../../contracts/access';
import type { roleMessages } from './role-messages';

type Labels = { [Key in keyof typeof roleMessages.en]: string };

export function createRoleColumns({
  t,
  canDelete,
  open,
  remove,
}: {
  t: Labels;
  canDelete: boolean;
  open: (id: string) => void;
  remove: (role: RoleListItem) => void;
}) {
  return [
    {
      key: 'code',
      header: t.code,
      sortable: true,
      cell: (role: RoleListItem) => <span className="font-mono text-xs">{role.code}</span>,
    },
    {
      key: 'name',
      header: t.name,
      sortable: true,
      cell: (role: RoleListItem) => (
        <AppLink
          href={`/dashboard/roles/${role.id}`}
          prefetch={false}
          className="font-medium hover:underline"
        >
          {role.name}
        </AppLink>
      ),
    },
    {
      key: 'status',
      header: t.status,
      cell: (role: RoleListItem) => (
        <div className="flex gap-1">
          <Pill tone={role.status === 'active' ? 'success' : 'warning'}>{t[role.status]}</Pill>
          {role.isSuper ? <Pill>{t.super}</Pill> : null}
        </div>
      ),
    },
    { key: 'adminCount', header: t.admins, cell: (role: RoleListItem) => role.adminCount },
    {
      key: 'permissionCount',
      header: t.grants,
      cell: (role: RoleListItem) => (role.isSuper ? t.all : role.permissionCount),
    },
    {
      key: 'actions',
      header: t.actions,
      cell: (role: RoleListItem) => (
        <Menu>
          <MenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`${t.actions}: ${role.name}`} />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => open(role.id)}>{t.detail}</MenuItem>
            {!role.isSuper && canDelete ? (
              <MenuItem tone="destructive" onClick={() => remove(role)}>
                {t.remove}
              </MenuItem>
            ) : null}
          </MenuContent>
        </Menu>
      ),
    },
  ];
}
