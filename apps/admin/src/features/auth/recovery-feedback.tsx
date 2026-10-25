import { Banner } from '@new-cms/ui/feedback';
import type { ApiResult } from '../../api/result';
import type { RecoveryMessages } from './recovery-messages';

export type RecoveryFailure = Extract<ApiResult<unknown>, { ok: false }>;

export function RecoveryFeedback({
  error,
  messages: t,
  requestOnly = false,
}: {
  error: RecoveryFailure | null;
  messages: RecoveryMessages;
  requestOnly?: boolean;
}) {
  if (!error) return null;
  const message = recoveryError(error, t, requestOnly);
  return (
    <Banner tone={error.uncertain ? 'warning' : 'error'} className="space-y-2 break-words">
      <p>{message}</p>
      {error.retryAfterSeconds !== null ? (
        <p>{t.retryAfter.replace('{seconds}', String(error.retryAfterSeconds))}</p>
      ) : null}
      {error.error.requestId ? (
        <p className="text-xs">
          {t.requestId}: {error.error.requestId}
        </p>
      ) : null}
    </Banner>
  );
}

function recoveryError(error: RecoveryFailure, t: RecoveryMessages, requestOnly: boolean) {
  if (error.uncertain) return requestOnly ? t.requestUncertain : t.uncertain;
  if (error.status === 429) return t.rateLimited;
  if (error.error.code === 'unauthenticated' || error.error.code === 'token_invalid')
    return t.invalidToken;
  if (error.error.code === 'invalid_input') return t.invalidInput;
  return t.failed;
}
