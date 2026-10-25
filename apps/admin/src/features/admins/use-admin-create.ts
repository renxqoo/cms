'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { accountCreatedSchema } from '../../contracts/access';
import type { AccountCreated, RoleListItem } from '../../contracts/access';
import { createAdminInput, focusAdminError } from './admin-input';
import type { AdminCreateValues, AdminErrors } from './admin-input';

type Failure = Extract<ApiResult<unknown>, { ok: false }>;
interface CreateState {
  phase: 'idle' | 'pending' | 'success';
  error: Failure | null;
  errors: AdminErrors;
  created: AccountCreated | null;
}
interface CreateInput {
  roles: readonly RoleListItem[];
  allowed: boolean;
  reportResult: (result: ApiResult<unknown>) => void;
  onCreated: (created: AccountCreated) => void;
}
interface CreateContext extends CreateInput {
  state: CreateState;
  setState: Dispatch<SetStateAction<CreateState>>;
  active: RefObject<AbortController | null>;
  intent: RefObject<{ body: AdminCreateValues; key: string } | null>;
}

export function useAdminCreate(input: CreateInput) {
  const [state, setState] = useState<CreateState>({
    phase: 'idle',
    error: null,
    errors: {},
    created: null,
  });
  const active = useRef<AbortController | null>(null);
  const intent = useRef<CreateContext['intent']['current']>(null);
  useEffect(() => () => active.current?.abort(), []);
  const context: CreateContext = { ...input, state, setState, active, intent };
  return {
    ...state,
    submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (active.current || state.error?.uncertain || !input.allowed) return;
      const values = createAdminInput(new FormData(event.currentTarget), input.roles);
      setState((previous) => ({ ...previous, errors: values.errors }));
      if (!values.valid) return focusAdminError(event.currentTarget, values.errors);
      if (JSON.stringify(intent.current?.body) !== JSON.stringify(values.body))
        intent.current = { body: values.body, key: crypto.randomUUID() };
      return createAccount(context);
    },
    retry: () => createAccount(context),
    stop() {
      if (!active.current) return;
      active.current.abort();
      active.current = null;
      setState((previous) => ({
        ...previous,
        phase: 'idle',
        error: failure('request_cancelled', 0, { uncertain: true }),
      }));
    },
  };
}

async function createAccount(context: CreateContext) {
  const { active, intent, setState } = context;
  if (
    active.current ||
    !intent.current ||
    !context.allowed ||
    context.state.phase === 'success' ||
    !context.roles.some(
      (role) => role.id === intent.current?.body.roleId && role.status === 'active',
    )
  )
    return;
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({ ...previous, phase: 'pending', error: null }));
  const result = await requestApi({
    operation: 'admins.create',
    body: intent.current.body,
    idempotencyKey: intent.current.key,
    response: accountCreatedSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  context.reportResult(result);
  if (result.ok) {
    setState({ phase: 'success', error: null, errors: {}, created: result.data });
    context.onCreated(result.data);
  } else {
    active.current = null;
    setState((previous) => ({ ...previous, phase: 'idle', error: result }));
  }
}
