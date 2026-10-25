'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardDescription, CardHeader } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';
import { useClientReady } from '../../components/use-client-ready';
import { authMessages } from './auth-messages';
import { ExpiredSessionMessage, useExpiredSession } from './expired-session';
import { LoginFeedbackMessage } from './login-feedback';
import { LoginFields } from './login-fields';
import { checkLoginSession, safeLoginNext } from './login-navigation';
import { useLoginFlow } from './use-login-flow';

export interface LoginFormProps {
  next?: string;
  expired?: boolean;
  unavailable?: boolean;
}

export function LoginForm({ next, expired = false, unavailable = false }: LoginFormProps) {
  const ready = useClientReady();
  const locale = useShell((state) => state.locale);
  const t = authMessages[locale];
  const destination = safeLoginNext(next);
  const flow = useLoginFlow(destination);
  const pending = flow.phase !== 'idle';
  const session = useExpiredSession(expired, destination);
  const blocked = !ready || unavailable || session.state !== 'ready';

  return (
    <Card className="w-full gap-6 py-[33px] shadow-sm">
      <CardHeader className="gap-2 px-7 text-center">
        <h1 className="text-2xl leading-tight font-semibold">{t.title}</h1>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-7">
        {expired ? (
          <ExpiredSessionMessage state={session.state} retry={session.retry} messages={t} />
        ) : null}
        {unavailable ? (
          <Banner tone="error" className="space-y-2">
            <p>{t.unavailable}</p>
            <Button variant="outline" onClick={checkLoginSession}>
              {t.retry}
            </Button>
          </Banner>
        ) : null}
        <form
          aria-label={t.title}
          method="post"
          action="/api/cms/v1/auth/login"
          noValidate
          aria-busy={pending}
          className="space-y-6"
          onSubmit={(event) => {
            if (blocked) event.preventDefault();
            else void flow.submit(event);
          }}
        >
          <LoginFields
            values={flow.values}
            errors={flow.errors}
            disabled={blocked || pending}
            change={flow.change}
            messages={t}
          />
          <LoginFeedbackMessage feedback={flow.feedback} messages={t} />
          <div className="space-y-2">
            <Button type="submit" className="h-10 w-full" busy={pending} disabled={blocked}>
              {pending ? t.submitting : t.submit}
            </Button>
            {flow.phase === 'pending' ? (
              <Button variant="ghost" className="h-10 w-full" onClick={flow.cancel}>
                {t.cancel}
              </Button>
            ) : null}
          </div>
          <p className="text-center text-sm text-muted-foreground">{t.noAccount}</p>
        </form>
      </CardContent>
    </Card>
  );
}
