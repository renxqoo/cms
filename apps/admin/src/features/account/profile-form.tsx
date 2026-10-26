'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@new-cms/ui/actions';
import { Banner, useClientReady } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@new-cms/ui/layout';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import type { Me } from '../../contracts/auth';
import type { AccountMessages } from './account-messages';
import { useProfileFlow } from './use-profile-flow';

export function ProfileForm({
  principal,
  messages: t,
}: {
  principal: Me;
  messages: AccountMessages;
}) {
  const ready = useClientReady();
  const router = useRouter();
  const navigation = useAppNavigation();
  const access = useAccessControl();
  const flow = useProfileFlow({
    principal,
    reportResult: access.reportResult,
    refresh: () => router.refresh(),
  });
  const busy = flow.phase !== 'idle';
  const disabled = !ready || busy || flow.locked;
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
      <Card>
        <CardHeader>
          <CardTitle>{t.profile}</CardTitle>
          <CardDescription>{t.profileDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">{t.email}</dt>
              <dd className="mt-1 break-words">{principal.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.role}</dt>
              <dd className="mt-1">{principal.role.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t.status}</dt>
              <dd className="mt-1">{principal.role.status === 'active' ? t.active : t.disabled}</dd>
            </div>
          </dl>
          <form
            method="post"
            action="/api/cms/v1/me"
            noValidate
            aria-label={t.profile}
            aria-busy={busy}
            className="space-y-4"
            onSubmit={(event) => {
              if (!ready) event.preventDefault();
              else void flow.submit(event);
            }}
          >
            <Field
              id="profile-name"
              name="displayName"
              label={t.name}
              description={t.nameHint}
              error={flow.fieldError ? t[flow.fieldError] : undefined}
            >
              <Input
                value={flow.value}
                autoComplete="name"
                disabled={disabled}
                onChange={(event) => flow.change(event.target.value)}
              />
            </Field>
            <ManagementFeedback error={flow.error} />
            <ManagementFeedback error={flow.inspectionError} />
            {flow.success ? <Banner tone="success">{t[flow.success]}</Banner> : null}
            {flow.locked ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t.conflictHint}</p>
                <Button
                  variant="outline"
                  busy={flow.phase === 'checking'}
                  onClick={() => void flow.inspect()}
                >
                  {flow.phase === 'checking' ? t.inspecting : t.inspect}
                </Button>
                {flow.inspected ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      {t.currentName}: {flow.observed.displayName ?? t.unset}
                    </p>
                    <Button variant="outline" onClick={() => flow.continueEditing()}>
                      {t.continueEditing}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button type="submit" disabled={disabled} busy={flow.phase === 'saving'}>
              {flow.phase === 'saving' ? t.saving : t.save}
            </Button>
          </form>
        </CardContent>
      </Card>
    </UnsavedChangesGuard>
  );
}
