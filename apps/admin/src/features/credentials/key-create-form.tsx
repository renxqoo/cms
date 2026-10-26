'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import { DialogFooter } from '@new-cms/ui/overlays';
import { requestApi } from '../../api/client';
import { useShell } from '../../components/shell/shell-provider';
import type { AllowedOperation } from '../../contracts/auth';
import { collectionListSchema } from '../../contracts/content';
import { keyCreatedSchema } from '../../contracts/credentials';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { useApiQuery } from '../management-shared/query';
import type { ApiFailure } from '../management-shared/read-all-pages';
import { credentialMessages } from './credential-messages';
import { credentialPolicy, defaultKeyExpiry, validKeyExpiry } from './credential-policy';
import { ResourcePermissionEditor } from './resource-permission-editor';
import { grantKey, selectableGrants } from './resource-permission-model';
import { useCredentialAction } from './use-credential-action';

type KeyMessages = (typeof credentialMessages)['en'];

function inputErrors(
  input: { name: string; expiry: string; grants: readonly AllowedOperation[] },
  t: KeyMessages,
) {
  const errors: Record<string, string> = {};
  if (!input.name.trim() || input.name.trim().length > credentialPolicy.nameMaxLength)
    errors.name = t.invalidName;
  if (!validKeyExpiry(input.expiry)) errors.expiry = t.invalidExpiry;
  if (input.grants.length === 0) errors.grants = t.invalidGrants;
  return errors;
}

function responseErrors(error: ApiFailure, t: KeyMessages) {
  const errors: Record<string, string> = {};
  for (const item of error.error.fieldErrors ?? []) {
    if (item.field === 'name') errors.name = t.invalidName;
    else if (item.field === 'expiresAt') errors.expiry = t.expiresHint;
    else if (item.field === 'grants' || item.field.startsWith('grants.'))
      errors.grants = t.invalidGrants;
  }
  return errors;
}

function useKeyCatalogue() {
  const access = useAccessControl();
  const query = useApiQuery({ operation: 'collections.list', response: collectionListSchema });
  const collections = query.data?.rows ?? [];
  const ready = query.phase === 'ready' && access.phase === 'ready';
  return {
    collections,
    ready,
    grants: ready ? selectableGrants(access.operations) : [],
    error: query.error ?? access.error,
    retry: query.error ? query.reload : access.refresh,
    report: access.reportResult,
  };
}

export function KeyCreateForm({
  onCreated,
  onClose,
  onPendingChange,
}: {
  onCreated: (secret: string) => void;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const id = useId();
  const t = credentialMessages[useShell((state) => state.locale)];
  const catalogue = useKeyCatalogue();
  const action = useCredentialAction();
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState(defaultKeyExpiry);
  const [selection, setSelection] = useState<AllowedOperation[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const allowed = new Set(catalogue.grants.map(grantKey));
  const value = selection.filter((grant) => allowed.has(grantKey(grant)));
  const uncertain = action.error?.uncertain === true;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalogue.ready || action.pending || uncertain) return;
    const next = inputErrors({ name, expiry, grants: value }, t);
    setErrors(next);
    const [first] = Object.keys(next);
    if (first) {
      document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    onPendingChange(true);
    const result = await action.run((signal) =>
      requestApi({
        operation: 'credentials.createKey',
        body: { name: name.trim(), expiresAt: new Date(expiry).toISOString(), grants: value },
        response: keyCreatedSchema,
        signal,
      }),
    );
    if (!result) return;
    onPendingChange(false);
    catalogue.report(result);
    if (result.ok) onCreated(result.data.apiKey);
    else setErrors(responseErrors(result, t));
  }
  return (
    <>
      <ManagementFeedback
        error={action.error ?? catalogue.error}
        {...(catalogue.error ? { onRetry: catalogue.retry } : {})}
      />
      {uncertain ? <Banner tone="warning">{t.unknownCreation}</Banner> : null}
      <form
        id={id}
        aria-label={t.create}
        noValidate
        onSubmit={(event) => void submit(event)}
        aria-busy={action.pending}
        className="space-y-4"
      >
        <fieldset disabled={action.pending || uncertain} className="space-y-4">
          <Field
            id={`${id}-name`}
            label={t.name}
            description={t.nameHint}
            error={errors.name}
            required
          >
            <Input
              autoComplete="off"
              value={name}
              maxLength={credentialPolicy.nameMaxLength}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            id={`${id}-expiry`}
            label={t.expires}
            description={t.expiresHint}
            error={errors.expiry}
            required
          >
            <Input
              type="datetime-local"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </Field>
          {!catalogue.ready && !catalogue.error ? <p role="status">{t.loading}</p> : null}
          <div
            id={`${id}-grants`}
            tabIndex={-1}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ResourcePermissionEditor
              grants={catalogue.grants}
              collections={catalogue.collections}
              value={value}
              onChange={setSelection}
              disabled={!catalogue.ready || action.pending || uncertain}
            />
            {errors.grants ? (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {errors.grants}
              </p>
            ) : null}
          </div>
        </fieldset>
      </form>
      <DialogFooter>
        {action.pending ? (
          <Button
            variant="outline"
            onClick={() => {
              action.cancel();
              onPendingChange(false);
            }}
          >
            {t.cancel}
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose}>
            {t.close}
          </Button>
        )}
        <Button
          type="submit"
          form={id}
          disabled={!catalogue.ready || uncertain}
          busy={action.pending}
        >
          {t.create}
        </Button>
      </DialogFooter>
    </>
  );
}
