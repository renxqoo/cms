'use client';

import type { ReactNode } from 'react';
import { LayoutDashboardIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { AppShell } from '../../components/shell/app-shell';
import { useShell } from '../../components/shell/shell-provider';
import { appConfig } from '../../config/app';
import type { Me } from '../../contracts/auth';
import { AccountMenu } from './account-menu';
import { sessionMessages } from './session-messages';
import { useSignOut } from './use-sign-out';

export function AdminShell({ principal, children }: { principal: Me; children: ReactNode }) {
  const locale = useShell((state) => state.locale);
  const t = sessionMessages[locale];
  const flow = useSignOut();
  if (flow.state !== 'active')
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Banner tone={flow.state === 'leaving' ? 'info' : 'error'} className="max-w-lg space-y-3">
          <p>{flow.state === 'leaving' ? t.signingOut : t.uncertain}</p>
          {flow.state === 'unconfirmed' ? (
            <Button variant="outline" onClick={() => void flow.signOut()}>
              {t.retry}
            </Button>
          ) : null}
        </Banner>
      </main>
    );
  const footer = (
    <div className="min-w-0 overflow-hidden p-2">
      <p className="truncate text-sm font-medium">{principal.displayName ?? principal.email}</p>
      <p className="truncate text-xs text-muted-foreground">{principal.email}</p>
    </div>
  );
  return (
    <AppShell
      surface={{
        homeHref: '/dashboard',
        subtitle: t.subtitle,
        groups: [
          {
            id: 'workspace',
            label: t.group,
            items: [{ href: '/dashboard', label: t.dashboard, icon: LayoutDashboardIcon }],
          },
        ],
        footer,
        account: <AccountMenu principal={principal} signOut={flow.signOut} />,
        breadcrumbs: [
          { id: 'home', label: appConfig.name, href: '/dashboard' },
          { id: 'dashboard', label: t.dashboard },
        ],
      }}
    >
      {children}
    </AppShell>
  );
}
