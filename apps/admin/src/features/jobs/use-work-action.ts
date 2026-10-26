'use client';

import { useEffect, useRef, useState } from 'react';
import type { z } from 'zod';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import type { OperationId } from '../../contracts/operations';
import { useAccessControl } from '../access-control/provider';

interface WorkActionInput<T> {
  operation: OperationId;
  params: Readonly<Record<string, string>>;
  response: z.ZodType<T>;
  allowed: boolean;
  idempotent?: boolean;
  body?: unknown;
}

export function useWorkAction<T>(input: WorkActionInput<T>) {
  const [state, setState] = useState<{
    phase: 'idle' | 'pending' | 'unconfirmed' | 'done';
    error: Extract<ApiResult<unknown>, { ok: false }> | null;
    receipt: T | null;
  }>({ phase: 'idle', error: null, receipt: null });
  const active = useRef<AbortController | null>(null);
  const intent = useRef<string | null>(null);
  const { reportResult } = useAccessControl();
  useEffect(() => () => active.current?.abort(), []);
  async function run() {
    if (
      !input.allowed ||
      active.current ||
      state.phase === 'done' ||
      (state.phase === 'unconfirmed' && !input.idempotent)
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    intent.current ??= crypto.randomUUID();
    setState((current) => ({ ...current, phase: 'pending', error: null }));
    const result = await requestApi({
      operation: input.operation,
      params: input.params,
      response: input.response,
      signal: controller.signal,
      ...(input.idempotent ? { idempotencyKey: intent.current } : {}),
      ...(input.body === undefined ? {} : { body: input.body }),
    });
    if (controller.signal.aborted) return;
    active.current = null;
    reportResult(result);
    setState(
      result.ok
        ? { phase: 'done', error: null, receipt: result.data }
        : {
            phase: result.uncertain ? 'unconfirmed' : 'idle',
            error: result,
            receipt: null,
          },
    );
  }
  return { ...state, run };
}
