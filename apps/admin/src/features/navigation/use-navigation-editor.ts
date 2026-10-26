'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/client';
import { navigationNodeSchema, navigationListSchema } from '../../contracts/access';
import type { NavigationNode, Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import {
  flattenNavigation,
  navigationChanges,
  navigationDraft,
  navigationValues,
} from './navigation-model';
import type { FlatNode, NavigationDraft } from './navigation-model';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
interface State {
  current: NavigationNode | null;
  draft: NavigationDraft;
  latest: NavigationNode | null;
  error: Failure | null;
  phase: 'idle' | 'saving' | 'unconfirmed' | 'reading';
}
interface Context {
  locked: RefObject<boolean>;
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  active: RefObject<AbortController | null>;
  intent: RefObject<{ body: unknown; key: string; fingerprint: string } | null>;
  access: ReturnType<typeof useAccessControl>;
  done: () => void;
}

export function useNavigationEditor(initial: NavigationNode | null, done: () => void) {
  const [state, setState] = useState<State>(() => ({
    current: initial,
    draft: navigationDraft(initial),
    latest: null,
    error: null,
    phase: 'idle',
  }));
  const active = useRef<AbortController | null>(null);
  const intent = useRef<{ body: unknown; key: string; fingerprint: string } | null>(null);
  const locked = useRef(false);
  const access = useAccessControl();
  useEffect(() => () => active.current?.abort(), []);
  const context = { state, setState, active, intent, locked, access, done };
  return {
    ...state,
    setDraft: (draft: NavigationDraft) => {
      if (!locked.current) setState((current) => ({ ...current, draft }));
    },
    save: (input: {
      draft: NavigationDraft;
      nodes: FlatNode[];
      permissions: Permission[] | null;
    }) => save(context, input),
    readCurrent: () => readCurrent(context),
    adoptCurrent: () => {
      if (state.latest && !active.current) {
        locked.current = false;
        setState((current) => ({
          ...current,
          current: state.latest,
          latest: null,
          phase: 'idle',
          error: null,
        }));
      }
    },
  };
}

function prepare(
  context: Context,
  input: { draft: NavigationDraft; nodes: FlatNode[]; permissions: Permission[] | null },
) {
  if (!context.state.current && context.locked.current) return context.intent.current;
  const value = navigationValues(input.draft, input.nodes, input.permissions);
  if (!value || (context.state.current !== null && value.parentId === context.state.current.id))
    return null;
  const { status: _status, ...create } = value;
  const body = context.state.current
    ? { version: context.state.current.version, ...navigationChanges(context.state.current, value) }
    : create;
  if (context.state.current && Object.keys(body).length === 1) return null;
  const fingerprint = JSON.stringify(body);
  if (context.intent.current?.fingerprint !== fingerprint)
    context.intent.current = { body, fingerprint, key: crypto.randomUUID() };
  return context.intent.current;
}

async function save(
  context: Context,
  input: { draft: NavigationDraft; nodes: FlatNode[]; permissions: Permission[] | null },
) {
  const { state, active, access, setState } = context;
  const operation = state.current ? 'navigation.update' : 'navigation.create';
  if (
    active.current ||
    !access.can(operation) ||
    !access.can('navigation.list') ||
    (state.current && context.locked.current)
  )
    return;
  const intent = prepare(context, input);
  if (!intent) return setState((current) => ({ ...current, error: failure('invalid_input', 400) }));
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, draft: input.draft, phase: 'saving', error: null }));
  const result = await requestApi({
    operation,
    ...(state.current ? { params: { id: state.current.id } } : { idempotencyKey: intent.key }),
    body: intent.body,
    response: navigationNodeSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
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

async function readCurrent(context: Context) {
  const { state, active, access, setState } = context;
  if (active.current || !state.current || !access.can('navigation.list')) return;
  const { id } = state.current;
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, phase: 'reading' }));
  const result = await requestApi({
    operation: 'navigation.list',
    response: navigationListSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
  const latest = result.ok
    ? (flattenNavigation(result.data.rows).find(({ node }) => node.id === id)?.node ?? null)
    : null;
  const error = result.ok ? null : result;
  setState((current) => ({
    ...current,
    phase: 'unconfirmed',
    latest,
    error: error ?? current.error,
  }));
}
