'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { z } from 'zod';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import type { OperationId } from '../../contracts/operations';
import type { ContentFailure } from './channel-types';

export interface ContentMutationIntent {
  operation: OperationId;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  response: z.ZodType;
  key?: string;
}
export function useContentMutation(report: (result: ApiResult<unknown>) => void) {
  const [state, setState] = useState<{
    phase: 'idle' | 'writing' | 'blocked';
    error: ContentFailure | null;
    receipt: unknown;
  }>({ phase: 'idle', error: null, receipt: null });
  const active = useRef<AbortController | null>(null);
  const intent = useRef<ContentMutationIntent | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const context = { active, report, setState };

  return {
    ...state,
    async run(next: ContentMutationIntent) {
      if (state.phase === 'blocked' || active.current) return null;
      if (
        !intent.current ||
        JSON.stringify({ ...intent.current, response: undefined, key: undefined }) !==
          JSON.stringify({ ...next, response: undefined, key: undefined })
      )
        intent.current = { ...next, ...(next.key ? { key: crypto.randomUUID() } : {}) };
      return sendContentMutation(context, intent.current);
    },
    retry(allowed: boolean) {
      return allowed && state.phase === 'blocked' && intent.current?.key
        ? sendContentMutation(context, intent.current)
        : Promise.resolve(null);
    },
    clear() {
      if (!active.current) {
        intent.current = null;
        setState({ phase: 'idle', error: null, receipt: null });
      }
    },
  };
}

interface MutationContext {
  active: RefObject<AbortController | null>;
  report: (result: ApiResult<unknown>) => void;
  setState: Dispatch<
    SetStateAction<{
      phase: 'idle' | 'writing' | 'blocked';
      error: ContentFailure | null;
      receipt: unknown;
    }>
  >;
}
async function sendContentMutation(context: MutationContext, next: ContentMutationIntent) {
  const { active, report, setState } = context;

  if (active.current) return null;
  const controller = new AbortController();
  active.current = controller;
  setState({ phase: 'writing', error: null, receipt: null });
  const result = await requestApi({
    ...next,
    ...(next.key ? { idempotencyKey: next.key } : {}),
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return null;
  active.current = null;
  report(result);
  setState({
    phase: !result.ok && result.uncertain ? 'blocked' : 'idle',
    error: result.ok ? null : result,
    receipt: result.ok ? result.data : null,
  });
  return result;
}
