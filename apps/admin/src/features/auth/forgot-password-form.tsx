'use client';

import { MailIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { Banner, useClientReady } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { recoveryMessages } from './recovery-messages';
import { RecoveryCard, RecoveryLink } from './recovery-card';
import { RecoveryFeedback } from './recovery-feedback';
import { useResetRequest } from './use-reset-request';

export function ForgotPasswordForm() {
  const t = recoveryMessages[useShell((state) => state.locale)];
  const ready = useClientReady();
  const flow = useResetRequest();
  const blocked = !ready || flow.phase === 'pending' || flow.error?.uncertain;
  return (
    <RecoveryCard title={t.forgotTitle} description={t.forgotDescription}>
      {flow.phase === 'success' ? (
        <Banner tone="success">{t.accepted}</Banner>
      ) : (
        <form
          method="post"
          action="/api/cms/v1/auth/password-reset-requests"
          noValidate
          aria-label={t.forgotTitle}
          aria-busy={flow.phase === 'pending'}
          className="space-y-6"
          onSubmit={(event) => {
            if (!ready || flow.error?.uncertain) event.preventDefault();
            else void flow.submit(event);
          }}
        >
          <Field
            id="reset-email"
            name="email"
            label={t.email}
            error={flow.emailError && t[flow.emailError]}
            required
          >
            <div className="relative">
              <MailIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-3.5 left-3 z-10 size-4 text-muted-foreground"
              />
              <Input
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="h-11 pl-9"
                disabled={blocked}
              />
            </div>
          </Field>
          <RecoveryFeedback error={flow.error} messages={t} requestOnly />
          <Button
            type="submit"
            className="h-10 w-full"
            disabled={blocked}
            busy={flow.phase === 'pending'}
          >
            {flow.phase === 'pending' ? t.pending : t.requestReset}
          </Button>
          {flow.phase === 'pending' ? (
            <Button variant="ghost" className="h-10 w-full" onClick={flow.cancel}>
              {t.cancel}
            </Button>
          ) : null}
        </form>
      )}
      {flow.error?.uncertain ? (
        <RecoveryLink href="/forgot-password">{t.requestAnother}</RecoveryLink>
      ) : null}
      <RecoveryLink href="/login">{t.back}</RecoveryLink>
    </RecoveryCard>
  );
}
