'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/client';
import { bindingSchema } from '../../contracts/access';
import type { Endpoint, Permission, Binding } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { eligiblePermissions } from '../permissions/permission-model';
import { sameEndpoint } from './endpoint-model';
import { endpointReadSource } from './binding-read';
import type { EndpointReadSource } from './binding-read';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
interface State {
  current: Endpoint;
  selected: string;
  latest: Endpoint | null;
  error: Failure | null;
  phase: 'idle' | 'saving' | 'unconfirmed' | 'reading';
}
interface Context {
  locked: RefObject<boolean>;
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  active: RefObject<AbortController | null>;
  intent: RefObject<{ body: unknown; fingerprint: string; key: string } | null>;
  access: ReturnType<typeof useAccessControl>;
  done: () => void;
  source: EndpointReadSource;
}

export function useBindingEditor(
  initial: Endpoint,
  done: () => void,
  source: EndpointReadSource = endpointReadSource,
) {
  const [state, setState] = useState<State>(() => ({
    current: initial,
    selected: initial.binding?.permissionId ?? '',
    latest: null,
    error: null,
    phase: 'idle',
  }));
  const active = useRef<AbortController | null>(null);
  const intent = useRef<{ body: unknown; key: string; fingerprint: string } | null>(null);
  const locked = useRef(false);
  const access = useAccessControl();
  useEffect(() => () => active.current?.abort(), []);
  const context = { state, setState, active, intent, locked, access, done, source };
  return {
    ...state,
    select: (selected: string) => {
      if (!locked.current) setState((current) => ({ ...current, selected }));
    },
    save: (permissions: Permission[]) => save(context, permissions),
    readCurrent: () => readCurrent(context),
    adoptCurrent: () => {
      if (state.latest && !active.current) {
        locked.current = false;
        setState((current) => ({
          ...current,
          current: state.latest ?? current.current,
          latest: null,
          phase: 'idle',
          error: null,
        }));
      }
    },
  };
}

function prepare(context: Context) {
  const { state, intent } = context;
  if (!state.current.binding && context.locked.current) return intent.current;
  const body = state.current.binding
    ? { version: state.current.binding.version, permissionId: state.selected }
    : {
        operationId: state.current.operationId,
        scopeKind: state.current.scopeKind,
        collectionKey: state.current.collectionKey,
        permissionId: state.selected,
      };
  const fingerprint = JSON.stringify(body);
  if (intent.current?.fingerprint !== fingerprint)
    intent.current = { body, fingerprint, key: crypto.randomUUID() };
  return intent.current;
}

async function save(context: Context, permissions: Permission[]) {
  const { state, active, access, setState } = context;
  const existing = state.current.binding;
  const operation = existing ? 'endpoints.updateBinding' : 'endpoints.createBinding';
  if (
    active.current ||
    !access.can(operation) ||
    !access.can(context.source.operation) ||
    !state.current.bindingConfigurable ||
    (existing && context.locked.current)
  )
    return;
  if (
    !eligiblePermissions(state.current, permissions).some(
      (permission) => permission.id === state.selected,
    )
  )
    return setState((current) => ({ ...current, error: failure('invalid_input', 400) }));
  if (existing?.permissionId === state.selected) return;
  const input = prepare(context);
  if (!input) return;
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, phase: 'saving', error: null }));
  const result = await requestApi({
    operation,
    ...(existing ? { params: { id: existing.id } } : { idempotencyKey: input.key }),
    body: input.body,
    response: bindingSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
  applyResult(context, result);
}

async function readCurrent(context: Context) {
  const { state, active, access, setState } = context;
  if (active.current || !access.can(context.source.operation)) return;
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, phase: 'reading' }));
  const result = await context.source.read(controller.signal);
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
  const latest = result.ok
    ? (result.data.find((endpoint) => sameEndpoint(endpoint, state.current)) ?? null)
    : null;
  setState((current) => ({
    ...current,
    phase: 'unconfirmed',
    latest,
    error: result.ok ? current.error : result,
  }));
}

function applyResult(context: Context, result: ApiResult<Binding>) {
  const { access, setState } = context;
  context.locked.current =
    !result.ok && (result.uncertain || result.error.code === 'version_conflict');
  if (result.ok) {
    access.refresh();
    context.done();
  } else
    setState((current) => ({
      ...current,
      error: result,
      phase: result.uncertain || result.error.code === 'version_conflict' ? 'unconfirmed' : 'idle',
      latest: null,
    }));
}
