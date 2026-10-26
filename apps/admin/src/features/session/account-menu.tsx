'use client';

import { LogOutIcon, ShieldCheckIcon, UserRoundIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuLabel,
  MenuGroup,
  MenuSeparator,
  MenuItem,
} from '@new-cms/ui/overlays';
import { AppLink } from '../../components/shell/navigation/app-link';
import { getAdminRoute } from '../../config/admin-routes';
import { managementMessages } from '../management-shared/messages';
import { useShell } from '../../components/shell/shell-provider';
import type { Me } from '../../contracts/auth';
import { sessionMessages } from './session-messages';

export function AccountMenu({
  principal,
  signOut,
  canRecover,
}: {
  principal: Me;
  signOut: () => Promise<void>;
  canRecover: boolean;
}) {
  const locale = useShell((state) => state.locale);
  const t = sessionMessages[locale];
  const name = principal.displayName ?? principal.email;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg bg-muted ring-1 ring-border/50"
            aria-label={t.accountMenu}
          />
        }
      >
        <span className="text-xs font-medium uppercase">{name.slice(0, 2)}</span>
      </MenuTrigger>
      <MenuContent className="w-64">
        <MenuGroup>
          <MenuLabel className="space-y-1">
            <p className="truncate">{name}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">{principal.email}</p>
          </MenuLabel>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem render={<AppLink href={getAdminRoute('account').path} prefetch={false} />}>
          <UserRoundIcon />
          {managementMessages[locale].account}
        </MenuItem>
        {canRecover ? (
          <MenuItem render={<AppLink href={getAdminRoute('recovery').path} prefetch={false} />}>
            <ShieldCheckIcon />
            {getAdminRoute('recovery').label[locale]}
          </MenuItem>
        ) : null}
        <MenuItem onClick={() => void signOut()}>
          <LogOutIcon />
          {t.signOut}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
