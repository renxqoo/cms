'use client';

import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@new-cms/ui/overlays';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { getAdminRoute } from '../../config/admin-routes';
import type { AdminsMessages } from './admins-messages';

export function AdminRowActions({
  id,
  email,
  canRead,
  messages: t,
}: {
  id: string;
  email: string;
  canRead: boolean;
  messages: AdminsMessages;
}) {
  const navigation = useAppNavigation();
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`${t.actions}: ${email}`} />}
      >
        <MoreHorizontalIcon />
      </MenuTrigger>
      <MenuContent>
        <MenuItem
          disabled={!canRead}
          onClick={() => navigation.push(`${getAdminRoute('admins').path}/${id}`)}
        >
          {t.detail}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
