'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { getOperation } from '../../contracts/operations';
import { useAccessControl } from '../access-control/provider';
import type { EditorFailure } from './editor-controller';

type MutationRequest<T> = Omit<Parameters<typeof requestApi<T>>[0], 'signal'>;
interface MutationRuntime {
  active: RefObject<AbortController | null>;
  retry: RefObject<(() => Promise<unknown>) | null>;
  setPending: (value: boolean) => void;
  setError: (error: EditorFailure | null) => void;
  setLocked: (value: boolean) => void;
  setReplayable: (value: boolean) => void;
  report: (result: ApiResult<unknown>) => void;
}

async function runMutation<T>(
  runtime: MutationRuntime,
  input: MutationRequest<T>,
  onSuccess: (data: T) => void,
) {
  if (runtime.active.current) return null;
  const controller = new AbortController();
  runtime.active.current = controller;
  runtime.setPending(true);
  runtime.setError(null);
  const result = await requestApi({ ...input, signal: controller.signal });
  if (controller.signal.aborted) return null;
  runtime.active.current = null;
  runtime.setPending(false);
  runtime.report(result);
  const replayable =
    !result.ok && result.uncertain && getOperation(input.operation).idempotency === 'required';
  runtime.setReplayable(replayable);
  runtime.retry.current = replayable ? () => runMutation(runtime, input, onSuccess) : null;
  runtime.setLocked(!result.ok && (result.uncertain || result.error.code === 'version_conflict'));
  if (result.ok) onSuccess(result.data);
  else runtime.setError(result);
  return result;
}

async function verifyMutation<T>(
  runtime: MutationRuntime,
  input: MutationRequest<T>,
  onCurrent: (data: T) => void,
) {
  if (runtime.active.current || getOperation(input.operation).method !== 'GET') return;
  const controller = new AbortController();
  runtime.active.current = controller;
  runtime.setPending(true);
  const result = await requestApi({ ...input, signal: controller.signal });
  if (controller.signal.aborted) return;
  runtime.active.current = null;
  runtime.setPending(false);
  runtime.report(result);
  if (result.ok) onCurrent(result.data);
  else runtime.setError(result);
}

export function useContentMutation() {
  const { reportResult } = useAccessControl();
  const active = useRef<AbortController | null>(null);
  const retry = useRef<(() => Promise<unknown>) | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<EditorFailure | null>(null);
  const [locked, setLocked] = useState(false);
  const [replayable, setReplayable] = useState(false);
  useEffect(() => () => active.current?.abort(), []);
  const runtime = {
    active,
    retry,
    setPending,
    setError,
    setLocked,
    setReplayable,
    report: reportResult,
  };
  return {
    pending,
    error,
    locked,
    replayable,
    run: <T>(input: MutationRequest<T>, onSuccess: (data: T) => void) =>
      runMutation(runtime, input, onSuccess),
    verify: <T>(input: MutationRequest<T>, onCurrent: (data: T) => void) =>
      verifyMutation(runtime, input, onCurrent),
    retry: () => {
      void retry.current?.();
    },
    resolve: () => {
      setLocked(false);
      setError(null);
      setReplayable(false);
      retry.current = null;
    },
  };
}
