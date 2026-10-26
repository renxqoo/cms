'use client';

import { useEffect, useRef, useState } from 'react';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { ApiFailure } from '../management-shared/read-all-pages';

export function useCredentialAction() {
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  function cancel() {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setError(failure('request_cancelled', 0, { uncertain: true }));
  }

  async function run<T>(action: (signal: AbortSignal) => Promise<ApiResult<T>>) {
    if (active.current) return null;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    let result: ApiResult<T>;
    try {
      result = await action(controller.signal);
    } catch {
      result = failure('invalid_response', 0, { uncertain: true });
    }
    if (controller.signal.aborted || active.current !== controller) return null;
    active.current = null;
    setPending(false);
    if (!result.ok) setError(result);
    return result;
  }
  return { run, cancel, pending, error };
}
