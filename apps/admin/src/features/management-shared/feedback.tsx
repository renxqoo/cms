'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner, CopyButton } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import type { ApiFailure } from './read-all-pages';
import { managementFeedbackPolicy } from './policy';
import { managementMessages } from './messages';

type ManagementMessages = (typeof managementMessages)['en' | 'zh'];

function errorMessage(error: ApiFailure, messages: ManagementMessages): string {
  if (error.uncertain) return messages.uncertain;
  if (error.status === 429) return messages.limited;
  const codes: Record<string, string> = {
    invalid_input: messages.invalid,
    identifier_taken: messages.identifierTaken,
    last_super_admin: messages.lastSuper,
    idempotency_conflict: messages.intentConflict,
    binding_exists: messages.bindingExists,
    scope_mismatch: messages.scopeMismatch,
    invalid_scope: messages.invalidScope,
    capacity_exceeded: messages.capacity,
    payload_too_large: messages.tooLarge,
    unsupported_media_type: messages.unsupported,
    invalid_credentials: messages.credentials,
    request_cancelled: messages.cancelled,
    temporarily_unavailable: messages.unavailableService,
    version_conflict: messages.conflict,
    resource_in_use: messages.inUse,
    forbidden: messages.forbidden,
    endpoint_unbound: messages.unbound,
    protected_resource: messages.protected,
    not_found: messages.missing,
    unauthenticated: messages.expired,
    read_limit_exceeded: messages.budget,
    read_timeout: messages.budget,
    inconsistent_pagination: messages.inconsistent,
  };
  return Object.hasOwn(codes, error.error.code)
    ? (codes[error.error.code] ?? messages.failed)
    : messages.failed;
}

export function ManagementFeedback({
  error,
  onRetry,
}: {
  error: ApiFailure | null;
  onRetry?: () => void;
}) {
  const locale = useShell((state) => state.locale);
  if (!error) return null;
  const t = managementMessages[locale];
  return (
    <Banner tone="error" className="space-y-3">
      <p>{errorMessage(error, t)}</p>
      {error.retryAfterSeconds !== null ? (
        <p className="text-sm">
          {t.retryAfter} {error.retryAfterSeconds} {t.seconds}
        </p>
      ) : null}
      {error.error.requestId ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            {t.requestId}: <span className="break-all">{error.error.requestId}</span>
          </span>
          <CopyButton
            value={error.error.requestId}
            label={t.requestId}
            copiedLabel={t.copied}
            errorLabel={t.failed}
            feedbackDurationMs={managementFeedbackPolicy.copyFeedbackMs}
          />
        </div>
      ) : null}
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {t.retry}
        </Button>
      ) : null}
    </Banner>
  );
}
