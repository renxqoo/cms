'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner, useClientReady } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@new-cms/ui/overlays';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { AppLink } from '../../components/shell/navigation/app-link';
import { getAdminRoute } from '../../config/admin-routes';
import type { AccountCreated } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import type { AdminsMessages } from './admins-messages';
import { DeliveryStatus } from './delivery-status';
import { RoleField, useAdminRoles } from './role-field';
import { useAdminCreate } from './use-admin-create';

export function AdminCreateDialog({
  onClose,
  onCreated,
  messages: t,
}: {
  onClose: () => void;
  onCreated: (created: AccountCreated) => void;
  messages: AdminsMessages;
}) {
  const access = useAccessControl();
  const navigation = useAppNavigation();
  const roles = useAdminRoles();
  const ready = useClientReady();
  const allowed =
    access.can('admins.create') && access.can('roles.list') && roles.phase === 'ready';
  const flow = useAdminCreate({
    allowed,
    roles: roles.phase === 'ready' ? (roles.data ?? []) : [],
    reportResult: access.reportResult,
    onCreated,
  });
  const busy = flow.phase === 'pending';
  const locked = busy || flow.error?.uncertain === true;
  return (
    <UnsavedChangesGuard
      dirty={locked}
      navigation={navigation.adapter}
      labels={{
        title: t.leaveTitle,
        description: t.leaveDescription,
        confirm: t.leave,
        cancel: t.stay,
        close: t.close,
      }}
    >
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !locked) onClose();
        }}
      >
        <DialogContent closeLabel={t.close} showCloseButton={!locked}>
          <DialogHeader>
            <DialogTitle>{t.createTitle}</DialogTitle>
            <DialogDescription>{t.createDescription}</DialogDescription>
          </DialogHeader>
          {flow.created ? (
            <div className="space-y-4">
              <Banner tone="success">{t.created}</Banner>
              <p className="text-sm break-all">{flow.created.admin.email}</p>
              <DeliveryStatus delivery={flow.created.delivery} messages={t} />
              {access.can('admins.get') ? (
                <AppLink
                  href={`${getAdminRoute('admins').path}/${flow.created.admin.id}`}
                  className="text-sm text-primary underline underline-offset-4"
                >
                  {t.detail}
                </AppLink>
              ) : null}
            </div>
          ) : (
            <CreateAccountForm
              flow={flow}
              roles={roles}
              ready={ready}
              canRetry={allowed}
              messages={t}
            />
          )}
          <DialogFooter>
            {busy ? (
              <Button variant="ghost" onClick={() => flow.stop()}>
                {t.stop}
              </Button>
            ) : null}
            <Button variant="outline" disabled={locked} onClick={onClose}>
              {flow.created ? t.close : t.cancel}
            </Button>
            {!flow.created ? (
              <Button
                type="submit"
                form="create-admin"
                busy={busy}
                disabled={!ready || !allowed || locked}
              >
                {busy ? t.sending : t.submit}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </UnsavedChangesGuard>
  );
}

function CreateAccountForm({
  flow,
  roles,
  ready,
  canRetry,
  messages: t,
}: {
  flow: ReturnType<typeof useAdminCreate>;
  roles: ReturnType<typeof useAdminRoles>;
  ready: boolean;
  canRetry: boolean;
  messages: AdminsMessages;
}) {
  const busy = flow.phase === 'pending';
  const locked = busy || flow.error?.uncertain === true;
  return (
    <form
      id="create-admin"
      method="post"
      action="/api/cms/v1/admins"
      noValidate
      aria-label={t.createTitle}
      aria-busy={busy}
      className="space-y-4"
      onSubmit={(event) => {
        if (!ready) event.preventDefault();
        else void flow.submit(event);
      }}
    >
      <fieldset disabled={!ready || locked} className="space-y-4">
        <Field
          id="admin-email"
          name="email"
          label={t.email}
          error={flow.errors.email && t[flow.errors.email]}
          required
        >
          <Input type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Field>
        <Field
          id="admin-name"
          name="displayName"
          label={t.name}
          error={flow.errors.displayName && t[flow.errors.displayName]}
        >
          <Input autoComplete="off" />
        </Field>
        <RoleField
          roles={roles}
          disabled={locked}
          error={flow.errors.roleId && t[flow.errors.roleId]}
          messages={t}
        />
      </fieldset>
      <ManagementFeedback error={flow.error} />
      {flow.error?.uncertain ? (
        <Banner tone="warning" className="space-y-3">
          <p>{t.unknownIntent}</p>
          <Button variant="outline" disabled={!canRetry} onClick={() => void flow.retry()}>
            {t.retryIntent}
          </Button>
        </Banner>
      ) : null}
    </form>
  );
}
