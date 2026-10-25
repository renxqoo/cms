'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { PlusIcon, UsersIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useQueryNavigation } from '../../components/shell/navigation/use-query-navigation';
import { adminListSchema } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { adminsMessages } from './admins-messages';
import { AdminListPanel } from './admin-list-panel';
import { AdminCreateDialog } from './admin-create-dialog';
import { adminApiQuery, parseAdminQuery, updateAdminQuery } from './admins-query';
import type { AdminQueryChanges } from './admins-query';

export function AdminsListPage() {
  const locale = useShell((state) => state.locale);
  const t = adminsMessages[locale];
  const access = useAccessControl();
  const params = useSearchParams();
  const navigation = useAppNavigation();
  const [search, updateQuery] = useQueryNavigation(params.toString());
  const query = parseAdminQuery(new URLSearchParams(search));
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const canRead = access.can('admins.list');
  const result = useApiQuery({
    operation: 'admins.list',
    query: adminApiQuery(query),
    response: adminListSchema,
    enabled: canRead,
  });
  function change(changes: AdminQueryChanges) {
    const href = updateQuery(changes, updateAdminQuery);
    startTransition(() => navigation.push(href, { scroll: false }));
  }
  const createAllowed = access.can('admins.create') && access.can('roles.list');
  return (
    <ClientInteractionBoundary className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader
        title={t.title}
        description={t.description}
        icon={<UsersIcon />}
        actions={
          <CreateAdminButton
            visible={access.can('admins.create')}
            enabled={createAllowed}
            onClick={() => setCreating(true)}
            label={t.create}
          />
        }
      />
      {access.can('admins.create') && !access.can('roles.list') ? (
        <Banner>{t.readDependency}</Banner>
      ) : null}
      {canRead ? (
        <AdminListPanel
          result={result}
          query={query}
          locale={locale}
          pending={pending}
          canReadDetails={access.can('admins.get')}
          change={change}
          messages={t}
        />
      ) : (
        <Banner>{access.phase === 'loading' ? t.loading : t.unavailable}</Banner>
      )}
      {creating ? (
        <AdminCreateDialog
          messages={t}
          onClose={() => setCreating(false)}
          onCreated={() => result.reload()}
        />
      ) : null}
    </ClientInteractionBoundary>
  );
}

function CreateAdminButton({
  visible,
  enabled,
  onClick,
  label,
}: {
  visible: boolean;
  enabled: boolean;
  onClick: () => void;
  label: string;
}) {
  if (!visible) return null;
  return (
    <Button disabled={!enabled} onClick={onClick}>
      <PlusIcon />
      {label}
    </Button>
  );
}
