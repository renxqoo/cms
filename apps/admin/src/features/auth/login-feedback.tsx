import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import type { AuthMessages } from './auth-messages';
import type { LoginFeedback } from './use-login-flow';
import { checkLoginSession } from './login-navigation';

export function LoginFeedbackMessage({
  feedback,
  messages: t,
}: {
  feedback: LoginFeedback;
  messages: AuthMessages;
}) {
  if (!feedback) return null;
  const uncertain = feedback === 'cancelled' || feedback.uncertain;
  const message = feedback === 'cancelled' ? t.cancelled : failureMessage(feedback, t);
  return (
    <Banner tone={uncertain ? 'warning' : 'error'} className="space-y-2 break-words">
      <p>{message}</p>
      {feedback !== 'cancelled' && feedback.retryAfterSeconds !== null ? (
        <p>{t.retryAfter.replace('{seconds}', String(feedback.retryAfterSeconds))}</p>
      ) : null}
      {feedback !== 'cancelled' && feedback.error.requestId ? (
        <p className="text-xs">
          {t.requestId}: {feedback.error.requestId}
        </p>
      ) : null}
      {uncertain ? (
        <Button variant="outline" onClick={checkLoginSession}>
          {t.checkSession}
        </Button>
      ) : null}
    </Banner>
  );
}

function failureMessage(feedback: Exclude<LoginFeedback, 'cancelled' | null>, t: AuthMessages) {
  if (feedback.uncertain) return t.uncertain;
  if (feedback.status === 429) return t.rateLimited;
  switch (feedback.error.code) {
    case 'invalid_credentials':
      return t.invalidCredentials;
    case 'invalid_input':
      return t.invalidInput;
    case 'service_unavailable':
      return t.unavailable;
    default:
      return t.requestFailed;
  }
}
