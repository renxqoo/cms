'use client';

import { useEffect, useId, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { requestApi } from '../../api/client';
import type { AllowedOperation } from '../../contracts/auth';
import { authorizationDecisionSchema } from '../../contracts/credentials';
import { ManagementFeedback } from '../management-shared/feedback';
import { credentialMessages } from './credential-messages';
import { ResourcePermissionEditor } from './resource-permission-editor';
import { grantKey, selectableGrants } from './resource-permission-model';
import {
  authorizationDestination,
  returnToAuthorizationClient,
  returnToAuthorizationLogin,
} from './authorization-navigation';
import type { AuthorizationData } from './use-authorization-request';
import { useCredentialAction } from './use-credential-action';
import { credentialPolicy } from './credential-policy';

function useAuthorizationExpiry(expiresAt: string) {
  const [expired, setExpired] = useState(() => Date.parse(expiresAt) <= Date.now());
  useEffect(() => {
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return { expired, expire: () => setExpired(true) };
}

export function AuthorizationConsent({ data }: { data: AuthorizationData }) {
  const id = useId();
  const t = credentialMessages[useShell((state) => state.locale)];
  const action = useCredentialAction();
  const expiry = useAuthorizationExpiry(data.request.expiresAt);
  const [selection, setSelection] = useState<AllowedOperation[]>([]);
  const [finished, setFinished] = useState(false);
  const [invalidCallback, setInvalidCallback] = useState(false);
  const [grantError, setGrantError] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const grants = selectableGrants(data.operations, data.request.availableGrants);
  const allowed = new Set(grants.map(grantKey));
  const value = selection.filter((grant) => allowed.has(grantKey(grant)));
  const unsafe = authorizationDestination(data.request.redirectUri) === null;
  const locked =
    action.pending || finished || action.error?.uncertain === true || expiry.expired || unsafe;
  async function decide(approved: boolean) {
    if (locked) return;
    if (Date.parse(data.request.expiresAt) <= Date.now()) {
      expiry.expire();
      return;
    }
    if (approved && value.length === 0) {
      setGrantError(true);
      return;
    }
    if (approved && name.trim().length > credentialPolicy.nameMaxLength) {
      setNameError(true);
      return;
    }
    const result = await action.run((signal) =>
      requestApi({
        operation: 'credentials.decideAuthorization',
        params: { requestId: data.request.id },
        body: {
          approved,
          grants: approved ? value : [],
          ...(approved && name.trim() ? { name: name.trim() } : {}),
        },
        response: authorizationDecisionSchema,
        signal,
      }),
    );
    if (!result) return;
    if (!result.ok) {
      if (result.status === 401) returnToAuthorizationLogin(data.request.id);
      return;
    }
    setFinished(true);
    if (!returnToAuthorizationClient(result.data.redirectTo, data.request.redirectUri))
      setInvalidCallback(true);
  }
  return (
    <div className="space-y-4">
      {expiry.expired ? <Banner tone="error">{t.invalidRequest}</Banner> : null}
      {unsafe || invalidCallback ? <Banner tone="error">{t.unsafeCallback}</Banner> : null}
      <ManagementFeedback error={action.error} />
      {action.error?.uncertain ? <Banner tone="warning">{t.decisionUnknown}</Banner> : null}
      <dl className="space-y-3 text-sm">
        {[
          [t.application, `${data.request.clientName} (${data.request.clientId})`],
          [t.callback, data.request.redirectUri],
          [t.resource, data.request.resource],
          [t.scopes, data.request.scopes.join(' ')],
        ].map(([label, detail]) => (
          <div key={label}>
            <dt className="font-medium">{label}</dt>
            <dd className="mt-1 break-all text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
      {data.request.scopes.includes('offline_access') ? <Banner>{t.offline}</Banner> : null}
      <Field
        id={`${id}-name`}
        label={t.name}
        description={t.nameHint}
        error={nameError ? t.invalidName : undefined}
      >
        <Input
          value={name}
          placeholder={data.request.clientName}
          maxLength={credentialPolicy.nameMaxLength}
          disabled={locked}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
            setNameError(false);
          }}
        />
      </Field>
      <ResourcePermissionEditor
        grants={grants}
        collections={data.collections}
        value={value}
        onChange={(next) => {
          setSelection(next);
          setGrantError(false);
        }}
        disabled={locked}
      />
      {grantError ? (
        <p role="alert" className="text-sm text-destructive">
          {t.invalidGrants}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button disabled={locked} busy={action.pending} onClick={() => void decide(true)}>
          {t.approve}
        </Button>
        <Button variant="outline" disabled={locked} onClick={() => void decide(false)}>
          {t.deny}
        </Button>
        {action.pending ? (
          <Button variant="ghost" onClick={action.cancel}>
            {t.cancel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
