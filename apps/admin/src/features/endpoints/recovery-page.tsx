'use client';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { ShieldAlertIcon } from 'lucide-react';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { AppLink } from '../../components/shell/navigation/app-link';
import { getAdminRoute } from '../../config/admin-routes';
import { endpointListSchema, permissionListSchema } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import type { ApiFailure } from '../management-shared/query';
import { RecoveryWorkspace } from './recovery-workspace';
import { recoveryMessages } from './recovery-messages';

export function RecoveryPage() {
  const access = useAccessControl();
  const t = recoveryMessages[useShell((state) => state.locale)];
  const allowed = access.can('access.readRecovery') && access.principal.role.isSuper;
  const endpoints = useApiQuery({
    operation: 'endpoints.list',
    query: { page: 1, pageSize: 1 },
    response: endpointListSchema,
    enabled: allowed,
  });
  const permissions = useApiQuery({
    operation: 'permissions.list',
    query: { page: 1, pageSize: 1 },
    response: permissionListSchema,
    enabled: allowed,
  });
  const forbidden = endpoints.error?.status === 403 || permissions.error?.status === 403;
  function verify() {
    endpoints.reload();
    permissions.reload();
  }
  return (
    <ClientInteractionBoundary className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        icon={<ShieldAlertIcon />}
        actions={
          <Button variant="outline" disabled={!allowed} onClick={verify}>
            {t.verify}
          </Button>
        }
      />
      {!allowed && access.phase !== 'loading' ? <Banner tone="warning">{t.denied}</Banner> : null}
      {endpoints.error?.status !== 403 ? (
        <ManagementFeedback error={endpoints.error} onRetry={endpoints.reload} />
      ) : null}
      {permissions.error?.status !== 403 ? (
        <ManagementFeedback error={permissions.error} onRetry={permissions.reload} />
      ) : null}
      {forbidden && access.principal.role.isSuper ? <RecoveryWorkspace enabled={allowed} /> : null}
      <OrdinaryReadStatus endpoints={endpoints} permissions={permissions} allowed={allowed} />
    </ClientInteractionBoundary>
  );
}

interface OrdinaryRead {
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  error: ApiFailure | null;
}
function OrdinaryReadStatus({
  endpoints,
  permissions,
  allowed,
}: {
  endpoints: OrdinaryRead;
  permissions: OrdinaryRead;
  allowed: boolean;
}) {
  const t = recoveryMessages[useShell((state) => state.locale)];
  const forbidden = endpoints.error?.status === 403 || permissions.error?.status === 403;
  if (!forbidden && allowed && (endpoints.phase === 'loading' || permissions.phase === 'loading'))
    return <Banner>{t.checking}</Banner>;
  if (endpoints.phase !== 'ready' || permissions.phase !== 'ready') return null;
  return (
    <Banner className="space-y-3">
      <p>{t.normal}</p>
      <div className="flex flex-wrap gap-4">
        <AppLink href={getAdminRoute('endpoints').path} className="text-primary underline">
          {t.endpoints}
        </AppLink>
        <AppLink href={getAdminRoute('permissions').path} className="text-primary underline">
          {t.permissions}
        </AppLink>
      </div>
    </Banner>
  );
}
