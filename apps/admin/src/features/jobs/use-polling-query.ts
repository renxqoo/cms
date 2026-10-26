'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useApiQuery } from '../management-shared/query';
import type { ApiQuery } from '../management-shared/query';
import { discoveryPolicy } from './policy';

function usePageVisibility(deadline: RefObject<number | null>) {
  const [state, setState] = useState({ visible: false, expired: false });
  useEffect(() => {
    function observe() {
      setState({
        visible: document.visibilityState !== 'hidden',
        expired: deadline.current !== null && Date.now() >= deadline.current,
      });
    }
    observe();
    document.addEventListener('visibilitychange', observe);
    return () => document.removeEventListener('visibilitychange', observe);
  }, [deadline]);
  return { ...state, resume: () => setState((current) => ({ ...current, expired: false })) };
}

export function usePollingQuery<T>(
  input: ApiQuery<T> & { intervalMs: number; active: (data: T) => boolean },
) {
  const deadline = useRef<number | null>(null);
  const visibility = usePageVisibility(deadline);
  const [elapsed, setElapsed] = useState(false);
  const expired = elapsed || visibility.expired;
  const retryAt = useRef(0);
  const result = useApiQuery({
    ...input,
    enabled: (input.enabled ?? true) && visibility.visible && !expired,
  });
  const { phase, data, error, reload } = result;
  const { active, intervalMs, enabled = true } = input;
  const observing =
    enabled && visibility.visible && !expired && phase === 'ready' && data !== null && active(data);
  useEffect(() => {
    if (
      phase === 'failed' &&
      error?.retryAfterSeconds !== null &&
      error?.retryAfterSeconds !== undefined
    )
      retryAt.current = Date.now() + error.retryAfterSeconds * 1000;
  }, [phase, error]);
  useEffect(() => {
    if (!observing) return () => {};
    deadline.current ??= Date.now() + discoveryPolicy.maximumWaitMs;
    const remaining = deadline.current - Date.now();
    if (remaining <= 0) {
      setElapsed(true);
      return () => {};
    }
    const timer = setTimeout(
      () => {
        if (Date.now() >= (deadline.current ?? 0)) setElapsed(true);
        else reload();
      },
      Math.min(Math.max(intervalMs, discoveryPolicy.detailIntervalMs), Math.max(0, remaining)),
    );
    return () => clearTimeout(timer);
  }, [observing, intervalMs, reload]);
  function resume() {
    if (Date.now() < retryAt.current) return;
    deadline.current = Date.now() + discoveryPolicy.maximumWaitMs;
    setElapsed(false);
    visibility.resume();
    reload();
  }
  return { ...result, expired, observing, resume };
}
