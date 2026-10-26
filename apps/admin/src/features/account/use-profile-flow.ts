'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { adminSchema } from '../../contracts/access';
import { meSchema } from '../../contracts/auth';
import type { Me } from '../../contracts/auth';
import { formString } from '../auth/password-rules';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
interface ProfileState {
  confirmed: Me | null;
  base: Me | null;
  draft: string | null;
  phase: 'idle' | 'saving' | 'checking';
  error: Failure | null;
  inspectionError: Failure | null;
  fieldError: 'nameTooLong' | null;
  success: 'saved' | 'unchanged' | 'verified' | null;
  inspected: boolean;
  submittedName: string | null | undefined;
}
interface ProfileInput {
  principal: Me;
  reportResult: (result: ApiResult<unknown>) => void;
  refresh: () => void;
}
interface ProfileContext extends ProfileInput {
  state: ProfileState;
  current: Me;
  setState: Dispatch<SetStateAction<ProfileState>>;
  active: RefObject<AbortController | null>;
}

export function useProfileFlow(input: ProfileInput) {
  const [state, setState] = useState<ProfileState>(initialProfileState);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const observed =
    state.confirmed && state.confirmed.version >= input.principal.version
      ? state.confirmed
      : input.principal;
  const current = state.draft !== null && state.base ? state.base : observed;
  const value = state.draft ?? current.displayName ?? '';
  const locked = state.error?.uncertain === true || state.error?.error.code === 'version_conflict';
  const context: ProfileContext = { ...input, state, current, active, setState };
  return {
    ...state,
    current,
    observed,
    value,
    locked,
    dirty:
      (value === '' ? null : value) !== current.displayName || state.phase !== 'idle' || locked,
    change(nextValue: string) {
      if (active.current || locked) return;
      setState((previous) => ({
        ...previous,
        base: previous.base ?? current,
        draft: nextValue,
        fieldError: null,
        success: null,
      }));
    },
    submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      return saveProfile(context, event.currentTarget);
    },
    inspect: () => inspectProfile(context),
    continueEditing() {
      if (!state.inspected || active.current) return;
      setState((previous) => ({
        ...previous,
        error: null,
        base: observed,
        inspectionError: null,
        inspected: false,
        success: null,
      }));
    },
  };
}

async function saveProfile(context: ProfileContext, form: HTMLFormElement) {
  const { active, current, state, setState } = context;
  if (active.current || state.error?.uncertain || state.error?.error.code === 'version_conflict')
    return;
  const value = formString(new FormData(form), 'displayName');
  setState((previous) => ({
    ...previous,
    base: previous.base ?? current,
    draft: value,
    fieldError: null,
    success: null,
  }));
  if (invalidProfileName(context, form, value)) return;
  const displayName = value || null;
  if (displayName === current.displayName) {
    setState((previous) => ({ ...previous, base: null, draft: null, success: 'unchanged' }));
    return;
  }
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({
    ...previous,
    phase: 'saving',
    error: null,
    inspectionError: null,
    inspected: false,
    submittedName: displayName,
  }));
  const result = await requestApi({
    operation: 'access.updateOwnProfile',
    body: { version: current.version, displayName },
    response: adminSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  active.current = null;
  context.reportResult(result);
  if (result.ok) {
    setState((previous) => ({
      ...previous,
      confirmed: { ...current, ...result.data },
      base: null,
      draft: null,
      phase: 'idle',
      success: 'saved',
    }));
    context.refresh();
  } else setState((previous) => ({ ...previous, phase: 'idle', error: result }));
}

async function inspectProfile(context: ProfileContext) {
  const { active, setState, state } = context;
  if (active.current) return;
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({ ...previous, phase: 'checking', inspectionError: null }));
  const result = await requestApi({
    operation: 'access.me',
    response: meSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  active.current = null;
  context.reportResult(result);
  if (!result.ok)
    return setState((previous) => ({ ...previous, phase: 'idle', inspectionError: result }));
  const matched = Boolean(
    state.error?.uncertain && state.submittedName === result.data.displayName,
  );
  setState((previous) => ({
    ...previous,
    confirmed: result.data,
    phase: 'idle',
    inspected: true,
    error: matched ? null : previous.error,
    draft: matched ? null : previous.draft,
    base: matched ? null : previous.base,
    success: matched ? 'verified' : null,
  }));
  context.refresh();
}

function initialProfileState(): ProfileState {
  return {
    confirmed: null,
    base: null,
    draft: null,
    phase: 'idle',
    error: null,
    inspectionError: null,
    fieldError: null,
    success: null,
    inspected: false,
    submittedName: undefined,
  };
}

function invalidProfileName(context: ProfileContext, form: HTMLFormElement, value: string) {
  if (value.length <= 64) return false;
  context.setState((previous) => ({ ...previous, fieldError: 'nameTooLong' }));
  const field = form.elements.namedItem('displayName');
  if (field instanceof HTMLElement) field.focus();
  return true;
}
