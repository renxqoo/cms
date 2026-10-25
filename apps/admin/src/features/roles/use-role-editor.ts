'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { roleDetailSchema } from '../../contracts/access';
import type { RoleDetail } from '../../contracts/access';
import { useAccessControl } from '../access-control/provider';
import { metadataChanges, roleValues, sameGrants } from './role-model';
import type { RoleValues } from './role-model';
import { writeRole } from './role-editor-request';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

interface EditorState {
  confirmed: RoleDetail;
  values: RoleValues;
  grants: string[];
  phase: 'idle' | 'saving' | 'unconfirmed' | 'reading';
  error: Failure | null;
  latest: RoleDetail | null;
  saved: 'metadata' | 'grants' | null;
}

interface EditorContext {
  state: EditorState;
  setState: Dispatch<SetStateAction<EditorState>>;
  active: RefObject<AbortController | null>;
  locked: RefObject<boolean>;
  access: ReturnType<typeof useAccessControl>;
}

export function useRoleEditor(initial: RoleDetail) {
  const [state, setState] = useState<EditorState>(() => ({
    confirmed: initial,
    values: roleValues(initial),
    grants: initial.permissionIds,
    phase: 'idle',
    error: null,
    latest: null,
    saved: null,
  }));
  const active = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const access = useAccessControl();
  useEffect(() => () => active.current?.abort(), []);
  const context = { state, setState, active, locked, access };
  return {
    ...state,
    setValues: (values: RoleValues) => {
      if (!locked.current) setState((current) => ({ ...current, values, saved: null }));
    },
    setGrants: (grants: string[]) => {
      if (!locked.current) setState((current) => ({ ...current, grants, saved: null }));
    },
    save: (kind: 'metadata' | 'grants', values = state.values) =>
      saveRole(context, { kind, values }),
    readCurrent: () => readCurrent(context),
    adoptCurrent: () => adoptCurrent(context),
  };
}

async function saveRole(
  context: EditorContext,
  input: { kind: 'metadata' | 'grants'; values: RoleValues },
) {
  const { state, active, locked, access, setState } = context;
  if (
    locked.current ||
    active.current ||
    state.confirmed.isSuper ||
    !access.can('roles.get') ||
    !access.can(input.kind === 'metadata' ? 'roles.update' : 'roles.replacePermissions')
  )
    return;
  if (
    input.kind === 'metadata' &&
    Object.keys(metadataChanges(state.confirmed, input.values)).length === 0
  )
    return;
  if (input.kind === 'grants' && sameGrants(state.confirmed.permissionIds, state.grants)) return;
  locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({
    ...current,
    values: input.values,
    phase: 'saving',
    error: null,
    saved: null,
  }));
  const result = await writeRole({
    kind: input.kind,
    confirmed: state.confirmed,
    values: input.values,
    grants: state.grants,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  active.current = null;
  access.reportResult(result);
  applyWriteResult(context, result, input.kind);
}

async function readCurrent(context: EditorContext) {
  const { active, state, access, setState } = context;
  if (active.current || !access.can('roles.get')) return;
  context.locked.current = true;
  const controller = new AbortController();
  active.current = controller;
  setState((current) => ({ ...current, phase: 'reading' }));
  const result = await requestApi({
    operation: 'roles.get',
    params: { id: state.confirmed.id },
    response: roleDetailSchema,
    signal: controller.signal,
  });
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

function adoptCurrent(context: EditorContext) {
  if (!context.state.latest || context.active.current) return;
  const { latest } = context.state;
  context.locked.current = false;
  context.setState((current) => ({
    ...current,
    confirmed: latest,
    latest: null,
    phase: 'idle',
    error: null,
    saved: null,
  }));
}

function applyWriteResult(
  context: EditorContext,
  result: ApiResult<RoleDetail>,
  kind: 'metadata' | 'grants',
) {
  const { locked, setState, access } = context;
  if (result.ok) {
    locked.current = false;
    setState((current) => ({
      ...current,
      confirmed: result.data,
      phase: 'idle',
      saved: kind,
    }));
    if (result.data.id === access.principal.roleId) access.refresh();
  } else {
    locked.current = result.uncertain || result.error.code === 'version_conflict';
    setState((current) => ({
      ...current,
      phase: locked.current ? 'unconfirmed' : 'idle',
      error: result,
      latest: null,
    }));
  }
}
