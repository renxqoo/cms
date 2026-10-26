'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { OperationId } from '../../contracts/operations';
import type { Page } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { readAllPages } from './read-all-pages';
import type { ApiFailure } from './read-all-pages';

export type { ApiFailure } from './read-all-pages';

export interface ApiQuery<T> {
  operation: OperationId;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  response: z.ZodType<T>;
  enabled?: boolean;
  contextKey?: string;
}

interface QueryState<T> {
  key: string;
  resource: string;
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  data: T | null;
  error: ApiFailure | null;
}

function readParams(value: string) {
  return z.record(z.string(), z.string()).parse(JSON.parse(value) as unknown);
}

function readQuery(value: string) {
  return z.record(z.string(), z.unknown()).parse(JSON.parse(value) as unknown);
}

function queryKeys<T>(input: ApiQuery<T>) {
  const params = JSON.stringify(input.params ?? {});
  const query = JSON.stringify(input.query ?? {});
  return { params, query, key: JSON.stringify([input.operation, params, query, input.contextKey]) };
}

async function safeLoad<T>(
  load: (signal: AbortSignal) => Promise<ApiResult<T>>,
  signal: AbortSignal,
) {
  try {
    return await load(signal);
  } catch {
    return failure(signal.aborted ? 'request_cancelled' : 'invalid_response', 0);
  }
}

function retainedData<T>(state: QueryState<T>, resource: string): T | null {
  return state.resource === resource ? state.data : null;
}

function completedState<T>(
  state: QueryState<T>,
  input: { key: string; resource: string; result: ApiResult<T> },
): QueryState<T> {
  return {
    key: input.key,
    resource: input.resource,
    phase: input.result.ok ? 'ready' : 'failed',
    data: input.result.ok ? input.result.data : retainedData(state, input.resource),
    error: input.result.ok ? null : input.result,
  };
}

function observedState<T>(
  state: QueryState<T>,
  input: { key: string; resource: string; enabled: boolean },
) {
  let phase: QueryState<T>['phase'] = 'loading';
  if (!input.enabled) phase = 'idle';
  else if (state.key === input.key) ({ phase } = state);
  return {
    phase,
    data: retainedData(state, input.resource),
    error: state.resource === input.resource ? state.error : null,
  };
}

function useQuery<T>(
  key: string,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<ApiResult<T>>,
) {
  const { reportResult } = useAccessControl();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<QueryState<T>>({
    key: '',
    resource: '',
    phase: 'idle',
    data: null,
    error: null,
  });
  const denied = useRef<string | null>(null);
  const currentKey = JSON.stringify([key, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (enabled && denied.current !== currentKey) denied.current = null;
    if (!enabled || denied.current === currentKey) return () => {};
    const controller = new AbortController();
    setState((current) => ({
      key: currentKey,
      resource: key,
      phase: 'loading',
      data: retainedData(current, key),
      error: null,
    }));
    void safeLoad(load, controller.signal).then((result) => {
      if (controller.signal.aborted) return result;
      setState((current) => completedState(current, { key: currentKey, resource: key, result }));
      if (!result.ok) {
        if (result.status === 403) denied.current = currentKey;
        reportResult(result);
      }
      return result;
    });
    return () => controller.abort();
  }, [key, currentKey, enabled, load, reportResult]);
  return { ...observedState(state, { key: currentKey, resource: key, enabled }), reload };
}

export function useApiQuery<T>(input: ApiQuery<T>) {
  const { operation, response, enabled = true } = input;
  const { params, query, key } = queryKeys(input);
  const load = useCallback(
    (signal: AbortSignal) =>
      requestApi({
        operation,
        params: readParams(params),
        query: readQuery(query),
        response,
        signal,
      }),
    [operation, params, query, response],
  );
  return useQuery(key, enabled, load);
}

export function useAllPagesQuery<T>(input: ApiQuery<Page<T>> & { key: (row: T) => string }) {
  const { operation, response, enabled = true, key: rowKey } = input;
  const { params, query, key } = queryKeys(input);
  const load = useCallback(
    (signal: AbortSignal) =>
      readAllPages({
        operation,
        params: readParams(params),
        query: readQuery(query),
        response,
        signal,
        key: rowKey,
      }),
    [operation, params, query, response, rowKey],
  );
  return useQuery(key, enabled, load);
}
