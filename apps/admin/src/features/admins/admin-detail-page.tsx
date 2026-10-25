'use client';

import { useRouter } from 'next/navigation';
import { UserRoundIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { AppLink } from '../../components/shell/navigation/app-link';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useShell } from '../../components/shell/shell-provider';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { getAdminRoute } from '../../config/admin-routes';
import { adminDetailSchema } from '../../contracts/access';
import type { AdminDetail } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { adminsMessages } from './admins-messages';
import type { AdminsMessages } from './admins-messages';
import { AdminEditorForm } from './admin-editor-form';
import { AdminInvitation } from './admin-invitation';
import { AdminIdentity } from './admin-identity';
import { AdminChangeConfirmation } from './admin-change-confirmation';
import { useAdminEditor } from './use-admin-editor';
import { useAdminRoles } from './role-field';

export function AdminDetailPage({ id }: { id: string }) {
  const locale = useShell((state) => state.locale);
  const t = adminsMessages[locale];
  const access = useAccessControl();
  const result = useApiQuery({
    operation: 'admins.get',
    params: { id },
    response: adminDetailSchema,
    enabled: access.can('admins.get'),
  });
  return (
    <ClientInteractionBoundary className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader
        title={result.data?.displayName ?? result.data?.email ?? t.profile}
        description={t.description}
        icon={<UserRoundIcon />}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!access.can('admins.get')}
              busy={result.phase === 'loading'}
              onClick={result.reload}
            >
              {t.refreshUser}
            </Button>
            <AppLink
              href={getAdminRoute('admins').path}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.back}
            </AppLink>
          </>
        }
      />
      <ManagementFeedback error={result.error} onRetry={result.reload} />
      {result.data ? (
        <AdminDetailEditor
          key={id}
          admin={result.data}
          readReady={result.phase === 'ready'}
          onChanged={result.reload}
          locale={locale}
          messages={t}
        />
      ) : (
        <Banner>
          {result.phase === 'loading' || access.phase === 'loading'
            ? t.loading
            : t.detailUnavailable}
        </Banner>
      )}
    </ClientInteractionBoundary>
  );
}

function AdminDetailEditor({
  admin,
  readReady,
  onChanged,
  locale,
  messages: t,
}: {
  admin: AdminDetail;
  readReady: boolean;
  onChanged: () => void;
  locale: 'zh' | 'en';
  messages: AdminsMessages;
}) {
  const access = useAccessControl();
  const roles = useAdminRoles(access.can('admins.update'));
  const router = useRouter();
  const navigation = useAppNavigation();
  const canSave = access.can('admins.update') && access.can('admins.get') && readReady;
  const canInvite = access.can('admins.invite') && access.can('admins.get') && readReady;
  const flow = useAdminEditor({
    admin,
    principalId: access.principal.id,
    roles: roles.phase === 'ready' ? (roles.data ?? []) : [],
    canSave,
    canInvite,
    canRead: access.can('admins.get'),
    reportResult: access.reportResult,
    onChanged() {
      onChanged();
      if (admin.id === access.principal.id) router.refresh();
    },
  });
  return (
    <UnsavedChangesGuard
      dirty={flow.dirty}
      navigation={navigation.adapter}
      labels={{
        title: t.leaveTitle,
        description: t.leaveDescription,
        confirm: t.leave,
        cancel: t.stay,
        close: t.close,
      }}
    >
      <AdminIdentity admin={flow.observed} locale={locale} messages={t} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <AdminEditorForm
          flow={flow}
          roles={roles}
          canSave={canSave}
          own={admin.id === access.principal.id}
          messages={t}
        />
        <AdminInvitation flow={flow} canInvite={canInvite} messages={t} />
      </div>
      <AdminChangeConfirmation
        flow={flow}
        roles={roles.data ?? []}
        enabled={canSave && (!flow.confirmation?.roleId || roles.phase === 'ready')}
        messages={t}
      />
    </UnsavedChangesGuard>
  );
}
