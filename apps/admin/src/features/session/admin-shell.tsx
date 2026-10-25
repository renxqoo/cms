'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { AppShell } from '../../components/shell/app-shell';
import { useShell } from '../../components/shell/shell-provider';
import { appConfig } from '../../config/app';
import { activeAdminHref, matchAdminRoute } from '../../config/admin-routes';
import type { Me } from '../../contracts/auth';
import { AccessProvider, useAccessControl } from '../access-control/provider';
import { AccessFeedback } from '../access-control/access-feedback';
import { shellNavigation } from '../access-control/navigation';
import { RestoredSessionBoundary } from '../access-control/restored-session';
import { managementMessages } from '../management-shared/messages';
import { AccountMenu } from './account-menu';
import { sessionMessages } from './session-messages';
import { SessionActionsProvider } from './session-actions';
import { useSignOut } from './use-sign-out';

function AuthorizedShell({
  principal,
  signOut,
  children,
}: {
  principal: Me;
  signOut: () => Promise<void>;
  children: ReactNode;
}) {
  const locale = useShell((state) => state.locale);
  const t = sessionMessages[locale];
  const copy = managementMessages[locale];
  const pathname = usePathname();
  const access = useAccessControl();
  const navigation = shellNavigation({ navigation: access.navigation, locale, can: access.can });
  const route = matchAdminRoute(pathname);
  const breadcrumbs: { id: string; label: string; href?: string }[] = [
    { id: 'home', label: appConfig.name, href: '/dashboard' },
  ];
  if (route)
    breadcrumbs.push({
      id: route.id,
      label: route.label[locale],
      ...(pathname !== route.path ? { href: route.path } : {}),
    });
  if (route && pathname !== route.path) breadcrumbs.push({ id: 'detail', label: copy.details });
  const footer = (
    <div className="min-w-0 overflow-hidden p-2">
      <p className="truncate text-sm font-medium">{principal.displayName ?? principal.email}</p>
      <p className="truncate text-xs text-muted-foreground">{principal.email}</p>
    </div>
  );
  return (
    <RestoredSessionBoundary>
      <AppShell
        surface={{
          homeHref: '/dashboard',
          activeHref: activeAdminHref(
            pathname,
            navigation.groups.flatMap((group) => group.items.map((item) => item.href)),
          ),
          subtitle: t.subtitle,
          groups: navigation.groups,
          footer,
          account: <AccountMenu principal={principal} signOut={signOut} />,
          breadcrumbs,
        }}
      >
        <div className="space-y-6">
          <AccessFeedback empty={navigation.empty} invalid={navigation.invalid} />
          {children}
        </div>
      </AppShell>
    </RestoredSessionBoundary>
  );
}

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
  return (
    <SessionActionsProvider
      value={{ signOut: flow.signOut, completeSignOut: flow.completeSignOut }}
    >
      <AccessProvider principal={principal}>
        <AuthorizedShell principal={principal} signOut={flow.signOut}>
          {children}
        </AuthorizedShell>
      </AccessProvider>
    </SessionActionsProvider>
  );
}
