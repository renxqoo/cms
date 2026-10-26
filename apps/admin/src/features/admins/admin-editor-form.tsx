'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner, useClientReady } from '@new-cms/ui/feedback';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { RoleField } from './role-field';
import type { useAdminRoles } from './role-field';
import type { useAdminEditor } from './use-admin-editor';
import type { AdminsMessages } from './admins-messages';

export type AdminEditorFlow = ReturnType<typeof useAdminEditor>;

export function AdminEditorForm({
  flow,
  roles,
  canSave,
  own,
  messages: t,
}: {
  flow: AdminEditorFlow;
  roles: ReturnType<typeof useAdminRoles>;
  canSave: boolean;
  own: boolean;
  messages: AdminsMessages;
}) {
  const ready = useClientReady();
  const access = useAccessControl();
  const busy = flow.phase !== 'idle';
  const disabled = !ready || !canSave || busy || flow.locked;
  const pendingRole = flow.values.roleId !== flow.baseline.roleId && roles.phase !== 'ready';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.profile}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          action={`/api/cms/v1/admins/${flow.baseline.id}`}
          noValidate
          aria-label={t.profile}
          aria-busy={busy}
          className="space-y-4"
          onSubmit={(event) => {
            if (!ready) event.preventDefault();
            else void flow.submit(event);
          }}
        >
          <fieldset disabled={disabled} className="space-y-4">
            <Field
              id="edit-admin-name"
              name="displayName"
              label={t.name}
              error={flow.errors.displayName && t[flow.errors.displayName]}
            >
              <Input
                value={flow.values.displayName}
                autoComplete="off"
                onChange={(event) => flow.change('displayName', event.target.value)}
              />
            </Field>
            <RoleField
              roles={roles}
              current={{ id: flow.baseline.roleId, code: flow.baseline.roleCode }}
              value={flow.values.roleId}
              disabled={disabled || own}
              onChange={(value) => flow.change('roleId', value)}
              error={flow.errors.roleId && t[flow.errors.roleId]}
              messages={t}
            />
            {pendingRole ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => flow.change('roleId', flow.baseline.roleId)}
              >
                {t.revertRole}
              </Button>
            ) : null}
            <Field
              id="edit-admin-status"
              name="status"
              label={t.status}
              error={flow.errors.status && t[flow.errors.status]}
              required
            >
              <NativeSelect
                className="w-full"
                value={flow.values.status}
                disabled={disabled || own || flow.baseline.status === 'archived'}
                onChange={(event) => {
                  const { value } = event.target;
                  if (value === 'active' || value === 'disabled' || value === 'archived')
                    flow.change('status', value);
                }}
              >
                <option value="active">{t.active}</option>
                <option value="disabled">{t.disabled}</option>
                <option value="archived">{t.archived}</option>
              </NativeSelect>
            </Field>
          </fieldset>
          {own ? <p className="text-xs text-muted-foreground">{t.ownProtected}</p> : null}
          <AdminEditorFeedback flow={flow} canRead={access.can('admins.get')} messages={t} />
          <AdminSaveAction
            visible={access.can('admins.update')}
            disabled={disabled}
            pendingRole={pendingRole}
            flow={flow}
            messages={t}
          />
        </form>
      </CardContent>
    </Card>
  );
}

function AdminConflict({
  flow,
  canRead,
  messages: t,
}: {
  flow: AdminEditorFlow;
  canRead: boolean;
  messages: AdminsMessages;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.conflictHint}</p>
      <Button
        variant="outline"
        disabled={!canRead || flow.phase !== 'idle'}
        onClick={() => void flow.inspect()}
      >
        {flow.phase === 'checking' ? t.inspecting : t.inspect}
      </Button>
      {flow.inspected ? (
        <div className="space-y-2 rounded-lg border p-3 text-sm">
          <p>
            {t.serverVersion}: {flow.observed.version}
          </p>
          <p>
            {t.serverRole}: {flow.observed.roleCode}
          </p>
          <p>
            {t.serverStatus}: {t[flow.observed.status]}
          </p>
          <Button
            variant="outline"
            disabled={!canRead || flow.phase !== 'idle'}
            onClick={flow.continueEditing}
          >
            {t.continueEditing}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AdminEditorFeedback({
  flow,
  canRead,
  messages: t,
}: {
  flow: AdminEditorFlow;
  canRead: boolean;
  messages: AdminsMessages;
}) {
  return (
    <>
      <ManagementFeedback error={flow.error} />
      <ManagementFeedback error={flow.inspectionError} />
      {flow.success ? <Banner tone="success">{t[flow.success]}</Banner> : null}
      {flow.revoked ? <Banner tone="warning">{t.inviteAfterChange}</Banner> : null}
      {flow.locked && flow.lastOperation !== 'invite' ? (
        <AdminConflict flow={flow} canRead={canRead} messages={t} />
      ) : null}
    </>
  );
}

function AdminSaveAction({
  visible,
  disabled,
  pendingRole,
  flow,
  messages: t,
}: {
  visible: boolean;
  disabled: boolean;
  pendingRole: boolean;
  flow: AdminEditorFlow;
  messages: AdminsMessages;
}) {
  if (!visible) return null;
  return (
    <Button type="submit" busy={flow.phase === 'saving'} disabled={disabled || pendingRole}>
      {flow.phase === 'saving' ? t.saving : t.save}
    </Button>
  );
}
