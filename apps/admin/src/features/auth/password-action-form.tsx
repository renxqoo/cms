'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner, useClientReady } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { useActionToken } from './action-token';
import { recoveryMessages } from './recovery-messages';
import type { PasswordAction, RecoveryMessages } from './recovery-messages';
import { RecoveryCard, RecoveryLink } from './recovery-card';
import { RecoveryFeedback } from './recovery-feedback';
import { PasswordActionFields } from './password-action-fields';
import { usePasswordAction } from './use-password-action';

export function PasswordActionForm({ kind }: { kind: PasswordAction }) {
  const t = recoveryMessages[useShell((state) => state.locale)];
  const ready = useClientReady();
  const token = useActionToken();
  const flow = usePasswordAction({ kind, ...token });
  const invitation = kind === 'invitation';
  return (
    <RecoveryCard
      title={invitation ? t.inviteTitle : t.resetTitle}
      description={invitation ? t.inviteDescription : t.resetDescription}
    >
      <PasswordActionBody flow={flow} token={token.token} ready={ready} kind={kind} messages={t} />
      {!invitation && flow.phase !== 'success' ? (
        <RecoveryLink href="/forgot-password">{t.requestAnother}</RecoveryLink>
      ) : null}
      <RecoveryLink href="/login">{t.back}</RecoveryLink>
    </RecoveryCard>
  );
}

function PasswordActionBody({
  flow,
  token,
  ready,
  kind,
  messages: t,
}: {
  flow: ReturnType<typeof usePasswordAction>;
  token: string | null | undefined;
  ready: boolean;
  kind: PasswordAction;
  messages: RecoveryMessages;
}) {
  const invitation = kind === 'invitation';
  const blocked = !ready || flow.phase === 'pending' || Boolean(flow.error?.uncertain);
  if (flow.phase === 'success')
    return <Banner tone="success">{invitation ? t.activated : t.resetComplete}</Banner>;
  if (!token) return <Banner>{token === undefined ? t.checking : t.missing}</Banner>;
  return (
    <form
      method="post"
      action={
        invitation ? '/api/cms/v1/auth/invitation-acceptances' : '/api/cms/v1/auth/password-resets'
      }
      noValidate
      className="space-y-6"
      aria-label={invitation ? t.inviteTitle : t.resetTitle}
      aria-busy={flow.phase === 'pending'}
      onSubmit={(event) => {
        if (!ready) event.preventDefault();
        else void flow.submit(event);
      }}
    >
      <PasswordActionFields disabled={blocked} errors={flow.errors} messages={t} />
      <RecoveryFeedback error={flow.error} messages={t} />
      <Button
        type="submit"
        className="h-10 w-full"
        busy={flow.phase === 'pending'}
        disabled={blocked}
      >
        {flow.phase === 'pending' ? t.pending : invitation ? t.accept : t.reset}
      </Button>
      {flow.phase === 'pending' ? (
        <Button variant="ghost" className="h-10 w-full" onClick={flow.cancel}>
          {t.cancel}
        </Button>
      ) : null}
    </form>
  );
}
