'use client';

import { LayoutDashboardIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';
import type { Me } from '../../contracts/auth';
import { sessionMessages } from './session-messages';

export function Dashboard({ principal }: { principal: Me }) {
  const locale = useShell((state) => state.locale);
  const t = sessionMessages[locale];
  const details = [
    [t.name, principal.displayName ?? t.fallbackName],
    [t.email, principal.email],
    [t.role, principal.role.name],
    [t.state, t.active],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title={t.dashboard} description={t.description} icon={<LayoutDashboardIcon />} />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{t.current}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0 space-y-1">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm font-medium break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
