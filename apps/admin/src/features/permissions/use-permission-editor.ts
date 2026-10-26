'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/client';
import { permissionSchema } from '../../contracts/access';
import type { Permission } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { permissionReadSource } from './permission-read';
import type { PermissionReadSource } from './permission-read';
import {
  createPermissionSchema,
  permissionChanges,
  permissionValuesSchema,
} from './permission-model';
import { permissionDraft } from './permission-fields';
import type { PermissionDraft } from './permission-fields';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
interface State {
  current: Permission | null;
  draft: PermissionDraft;
  error: Failure | null;
  phase: 'idle' | 'saving' | 'unconfirmed' | 'reading';
  latest: Permission | null;
}
interface Context {
  locked: RefObject<boolean>;
  state: State;
  setState: Dispatch<SetStateAction<State>>;
  active: RefObject<AbortController | null>;
  intent: RefObject<{ body: unknown; fingerprint: string; key: string } | null>;
  access: ReturnType<typeof useAccessControl>;
  done: (permission: Permission) => void;
  source: PermissionReadSource;
}

export function usePermissionEditor(
  initial: Permission | null,
  done: (permission: Permission) => void,
  source: PermissionReadSource = permissionReadSource,
) {
  const [state, setState] = useState<State>(() => ({
    current: initial,
    draft: permissionDraft(initial),
    error: null,
    phase: 'idle',
    latest: null,
  }));
  const active = useRef<AbortController | null>(null);
  const intent = useRef<{ body: unknown; fingerprint: string; key: string } | null>(null);
  const locked = useRef(false);
  const access = useAccessControl();
  useEffect(() => () => active.current?.abort(), []);
  const context = { state, setState, active, intent, locked, access, done, source };
  return {
    ...state,
    setDraft: (draft: PermissionDraft) => {
      if (!locked.current) setState((current) => ({ ...current, draft }));
    },
    save: (draft: PermissionDraft) => save(context, draft),
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

function permissionBody(state: State, draft: PermissionDraft) {
  const values = {
    ...draft,
    description: draft.description || null,
    collectionKey: draft.scopeKind === 'collection' ? draft.collectionKey : null,
  };
  if (state.current) {
    const parsed = permissionValuesSchema.safeParse(values);
    return parsed.success
      ? { version: state.current.version, ...permissionChanges(state.current, parsed.data) }
      : null;
  }
  const parsed = createPermissionSchema.safeParse(values);
  return parsed.success ? parsed.data : null;
}

function prepareWrite(context: Context, draft: PermissionDraft) {
  const { state, intent } = context;
  if (context.locked.current && !state.current) return intent.current;
  const body = permissionBody(state, draft);
  if (!body || (state.current && Object.keys(body).length === 1)) return null;
  const fingerprint = JSON.stringify(body);
  if (intent.current?.fingerprint !== fingerprint)
    intent.current = { body, fingerprint, key: crypto.randomUUID() };
  return intent.current;
}

async function save(context: Context, draft: PermissionDraft) {
  const { state, active, access, setState } = context;
  const operation = state.current ? 'permissions.update' : 'permissions.create';
  if (permissionWriteBlocked(context, operation)) return;
  const input = prepareWrite(context, draft);
  if (!input) return setState((current) => ({ ...current, error: failure('invalid_input', 400) }));
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, draft, phase: 'saving', error: null }));
  const result = await requestApi({
    operation,
    ...(state.current ? { params: { id: state.current.id } } : { idempotencyKey: input.key }),
    body: input.body,
    response: permissionSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
  context.locked.current =
    !result.ok && (result.uncertain || result.error.code === 'version_conflict');
  if (result.ok) {
    if (state.current && state.current.status !== result.data.status) access.refresh();
    context.done(result.data);
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
  if (active.current || !state.current || !access.can(context.source.operation)) return;
  const { id } = state.current;
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, phase: 'reading' }));
  const result = await context.source.find({ id, signal: controller.signal });
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
  setState((current) => ({
    ...current,
    phase: 'unconfirmed',
    latest: result.ok ? result.data : null,
    error: result.ok ? current.error : result,
  }));
}

function permissionWriteBlocked(
  context: Context,
  operation: 'permissions.update' | 'permissions.create',
) {
  return (
    context.active.current !== null ||
    !context.access.can(operation) ||
    !context.access.can(context.source.operation) ||
    context.source.ready === false ||
    (context.locked.current && context.state.current !== null)
  );
}
