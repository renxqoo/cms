'use client';

import { Banner } from '@new-cms/ui/feedback';
import { Card, CardContent, CardDescription, CardHeader } from '@new-cms/ui/layout';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { credentialMessages } from './credential-messages';
import { useAuthorizationRequest } from './use-authorization-request';
import { AuthorizationConsent } from './authorization-consent';

export function AuthorizePage({ requestId, email }: { requestId: string | null; email?: string }) {
  const t = credentialMessages[useShell((state) => state.locale)];
  const query = useAuthorizationRequest(requestId);
  const invalid =
    !requestId || (query.error !== null && [400, 404, 409, 410].includes(query.error.status));
  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <h1 className="text-xl font-semibold">{t.consentTitle}</h1>
        <CardDescription>{t.consentHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {email ? (
          <p className="text-sm break-all">
            {t.signingInAs}: {email}
          </p>
        ) : null}
        {invalid ? (
          <Banner tone="error">{t.invalidRequest}</Banner>
        ) : (
          <ManagementFeedback error={query.error} onRetry={query.reload} />
        )}
        {query.phase === 'loading' && !invalid ? <p role="status">{t.loading}</p> : null}
        {query.data && !invalid ? (
          <AuthorizationConsent key={query.data.request.expiresAt} data={query.data} />
        ) : null}
      </CardContent>
    </Card>
  );
}
