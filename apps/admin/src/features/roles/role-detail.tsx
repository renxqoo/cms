'use client';

import { useState } from 'react';
import { ShieldCheckIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  PageHeader,
} from '@new-cms/ui/layout';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { roleDetailSchema, permissionListSchema } from '../../contracts/access';
import type { Permission, RoleDetail } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery, useAllPagesQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { PermissionPicker } from '../permissions/permission-picker';
import { useRoleEditor } from './use-role-editor';
import {
  blockedGrantIds,
  metadataChanges,
  roleFormValues,
  roleValuesSchema,
  sameGrants,
} from './role-model';
import { RoleFields } from './role-fields';
import { roleMessages } from './role-messages';

const permissionKey = (permission: Permission) => permission.id;

export function RoleDetailPage({ id }: { id: string }) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const query = useApiQuery({
    operation: 'roles.get',
    params: { id },
    response: roleDetailSchema,
    enabled: access.can('roles.get'),
  });
  const permissions = useAllPagesQuery({
    operation: 'permissions.list',
    response: permissionListSchema,
    key: permissionKey,
    enabled: access.can('permissions.list'),
  });
  return (
    <ClientInteractionBoundary className="space-y-6">
      <ManagementFeedback error={query.error} onRetry={query.reload} />
      {!access.can('roles.get') && access.phase === 'ready' ? (
        <Banner tone="warning">{t.readDenied}</Banner>
      ) : null}
      {query.data ? (
        <RoleEditor
          initial={query.data}
          permissions={permissions.data}
          dependencyError={Boolean(permissions.error)}
        />
      ) : query.phase === 'loading' || access.phase === 'loading' ? (
        <Banner>{t.pending}</Banner>
      ) : null}
      <ManagementFeedback error={permissions.error} onRetry={permissions.reload} />
    </ClientInteractionBoundary>
  );
}

function RoleEditor({
  initial,
  permissions,
  dependencyError,
}: {
  initial: RoleDetail;
  permissions: Permission[] | null;
  dependencyError: boolean;
}) {
  const flow = useRoleEditor(initial);
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const { adapter } = useAppNavigation();
  const dirty =
    Object.keys(metadataChanges(flow.confirmed, flow.values)).length > 0 ||
    !sameGrants(flow.confirmed.permissionIds, flow.grants) ||
    flow.phase !== 'idle';
  return (
    <UnsavedChangesGuard
      dirty={dirty}
      navigation={adapter}
      labels={{
        title: t.leaveTitle,
        description: t.leaveDescription,
        confirm: t.leave,
        cancel: t.stay,
        close: t.close,
      }}
    >
      <div className="space-y-6">
        <PageHeader
          title={flow.confirmed.name}
          description={`${flow.confirmed.code} · ${t.version} ${flow.confirmed.version}`}
          icon={<ShieldCheckIcon />}
        />
        <ManagementFeedback error={flow.error} />
        {flow.saved ? (
          <Banner tone="success">
            {t.saved} {flow.saved === 'metadata' ? t.metadata : t.grantTitle}
          </Banner>
        ) : null}
        {flow.confirmed.isSuper ? <Banner>{t.superDescription}</Banner> : null}
        <RoleConflict flow={flow} />
        <div className="grid gap-6 xl:grid-cols-2">
          <RoleMetadata flow={flow} />
          <RoleGrants flow={flow} permissions={permissions} dependencyError={dependencyError} />
        </div>
      </div>
    </UnsavedChangesGuard>
  );
}

type Flow = ReturnType<typeof useRoleEditor>;

function RoleConflict({ flow }: { flow: Flow }) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  if (flow.phase !== 'unconfirmed' && flow.phase !== 'reading') return null;
  return (
    <Banner tone="warning" className="space-y-3">
      <p>{t.conflict}</p>
      <Button
        variant="outline"
        busy={flow.phase === 'reading'}
        disabled={!access.can('roles.get')}
        onClick={() => void flow.readCurrent()}
      >
        {t.reload}
      </Button>
      {flow.latest ? (
        <>
          <p>
            {t.current}: {flow.latest.version}
          </p>
          <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {JSON.stringify(
              {
                name: flow.latest.name,
                description: flow.latest.description,
                status: flow.latest.status,
                permissionIds: flow.latest.permissionIds,
              },
              null,
              2,
            )}
          </pre>
          <Button variant="outline" onClick={flow.adoptCurrent}>
            {t.adopt}
          </Button>
        </>
      ) : null}
    </Banner>
  );
}

function RoleMetadata({ flow }: { flow: Flow }) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const [invalid, setInvalid] = useState(false);
  const dirty = Object.keys(metadataChanges(flow.confirmed, flow.values)).length > 0;
  const blocked =
    flow.phase !== 'idle' ||
    flow.confirmed.isSuper ||
    !access.can('roles.get') ||
    !access.can('roles.update');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.metadata}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = roleValuesSchema.safeParse(
              roleFormValues(new FormData(event.currentTarget)),
            );
            setInvalid(!parsed.success);
            if (parsed.success) void flow.save('metadata', parsed.data);
          }}
        >
          {invalid ? <Banner tone="error">{t.invalid}</Banner> : null}
          <fieldset disabled={blocked} className="space-y-4">
            <RoleFields locale={locale} values={flow.values} onChange={flow.setValues} />
          </fieldset>
          <Button type="submit" disabled={blocked || !dirty} busy={flow.phase === 'saving'}>
            {t.save}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RoleGrants({
  flow,
  permissions,
  dependencyError,
}: {
  flow: Flow;
  permissions: Permission[] | null;
  dependencyError: boolean;
}) {
  const access = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = roleMessages[locale];
  const blocked =
    flow.phase !== 'idle' ||
    flow.confirmed.isSuper ||
    !access.can('roles.get') ||
    !access.can('roles.replacePermissions');
  const badGrants = permissions ? blockedGrantIds(flow.grants, permissions) : [];
  const dirty = !sameGrants(flow.confirmed.permissionIds, flow.grants);
  const unavailable = !permissions || dependencyError;
  const invalid = badGrants.length > 0 || flow.grants.length > 2000;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.grantTitle}</CardTitle>
        <CardDescription>{t.grantsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissions && !dependencyError ? (
          <PermissionPicker
            permissions={permissions}
            value={flow.grants}
            onChange={flow.setGrants}
            disabled={blocked}
          />
        ) : (
          <Banner tone="warning">{t.dependency}</Banner>
        )}
        {badGrants.length > 0 ? <Banner tone="warning">{t.disabledGrants}</Banner> : null}
        {flow.grants.length > 2000 ? <Banner tone="error">{t.tooMany}</Banner> : null}
        <Button
          disabled={blocked || unavailable || invalid || !dirty}
          onClick={() => void flow.save('grants')}
        >
          {t.saveGrants}
        </Button>
      </CardContent>
    </Card>
  );
}
