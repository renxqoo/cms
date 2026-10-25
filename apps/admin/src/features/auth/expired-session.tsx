'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { requestApi } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import type { AuthMessages } from './auth-messages';
import { replaceAfterLogin } from './login-navigation';

export function useExpiredSession(expired: boolean, next: string) {
  const [state, setState] = useState<'checking' | 'ready' | 'failed'>(
    expired ? 'checking' : 'ready',
  );
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (expired) {
      active.current = controller;
      void clearExpiredSession(controller, next).then((result) => {
        if (!controller.signal.aborted && active.current === controller) {
          active.current = null;
          setState(result);
        }
        return result;
      });
    }
    return () => controller.abort();
  }, [expired, next]);

  async function retry() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState('checking');
    const result = await clearExpiredSession(controller, next);
    if (!controller.signal.aborted && active.current === controller) {
      active.current = null;
      setState(result);
    }
  }

  useEffect(() => () => active.current?.abort(), []);
  return { state, retry };
}

async function clearExpiredSession(controller: AbortController, next: string) {
  const result = await requestApi({
    operation: 'session.expire',
    response: emptyResponseSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return 'failed';
  if (result.ok) return 'ready';
  if (result.status === 409 && result.error.code === 'session_changed') replaceAfterLogin(next);
  return 'failed';
}

export function ExpiredSessionMessage({
  state,
  retry,
  messages: t,
}: {
  state: 'checking' | 'ready' | 'failed';
  retry: () => Promise<void>;
  messages: AuthMessages;
}) {
  return (
    <Banner tone={state === 'failed' ? 'error' : 'info'} className="space-y-2">
      <p>
        {state === 'checking'
          ? t.clearingExpired
          : state === 'failed'
            ? t.expiredUnavailable
            : t.expired}
      </p>
      {state === 'failed' ? (
        <Button variant="outline" onClick={() => void retry()}>
          {t.retry}
        </Button>
      ) : null}
    </Banner>
  );
}
