'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner, useClientReady } from '@new-cms/ui/feedback';
import { Field, PasswordInput } from '@new-cms/ui/forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@new-cms/ui/layout';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { useSessionActions } from '../session/session-actions';
import { recoveryMessages } from '../auth/recovery-messages';
import { useShell } from '../../components/shell/shell-provider';
import type { AccountMessages } from './account-messages';
import { usePasswordChange } from './use-password-change';

export function PasswordChangeForm({ messages: t }: { messages: AccountMessages }) {
  const ready = useClientReady();
  const access = useAccessControl();
  const session = useSessionActions();
  const labels = recoveryMessages[useShell((state) => state.locale)];
  const flow = usePasswordChange({
    reportResult: access.reportResult,
    completeSignOut: session.completeSignOut,
  });
  const pending = flow.phase !== 'idle';
  const blocked = !ready || pending || Boolean(flow.error?.uncertain);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.password}</CardTitle>
        <CardDescription>{t.passwordDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          action="/api/cms/v1/me/password"
          noValidate
          aria-label={t.password}
          aria-busy={pending}
          className="space-y-4"
          onSubmit={(event) => {
            if (!ready) event.preventDefault();
            else void flow.submit(event);
          }}
        >
          <Field
            id="change-current-password"
            name="currentPassword"
            label={t.currentPassword}
            error={flow.errors.currentPassword && t[flow.errors.currentPassword]}
            required
          >
            <PasswordInput
              autoComplete="current-password"
              disabled={blocked}
              showLabel={labels.showPassword}
              hideLabel={labels.hidePassword}
            />
          </Field>
          <Field
            id="change-new-password"
            name="newPassword"
            label={labels.newPassword}
            description={labels.passwordHint}
            error={flow.errors.newPassword && labels[flow.errors.newPassword]}
            required
          >
            <PasswordInput
              autoComplete="new-password"
              disabled={blocked}
              showLabel={labels.showPassword}
              hideLabel={labels.hidePassword}
            />
          </Field>
          <Field
            id="change-confirm-password"
            name="confirmPassword"
            label={labels.confirmPassword}
            error={flow.errors.confirmPassword && labels[flow.errors.confirmPassword]}
            required
          >
            <PasswordInput
              autoComplete="new-password"
              disabled={blocked}
              showLabel={labels.showPassword}
              hideLabel={labels.hidePassword}
            />
          </Field>
          <ManagementFeedback error={flow.error} />
          {flow.error?.uncertain ? (
            <Banner tone="warning" className="space-y-3">
              <p>{t.passwordUnknown}</p>
              <Button variant="outline" onClick={() => void session.signOut()}>
                {t.signOutVerify}
              </Button>
            </Banner>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={pending} disabled={blocked}>
              {pending ? t.changing : t.changePassword}
            </Button>
            {flow.phase === 'pending' ? (
              <Button variant="ghost" onClick={() => flow.cancel()}>
                {t.cancel}
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
