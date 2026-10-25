'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dispatch, FormEvent, RefObject, SetStateAction } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { emptyResponseSchema } from '../../contracts/auth';
import { focusChangePasswordError, passwordChangeInput } from './password-change-input';
import type { PasswordChangeErrors } from './password-change-input';

interface PasswordState {
  phase: 'idle' | 'pending' | 'navigating';
  error: Extract<ApiResult<unknown>, { ok: false }> | null;
  errors: PasswordChangeErrors;
}
interface PasswordContext {
  active: RefObject<AbortController | null>;
  state: PasswordState;
  setState: Dispatch<SetStateAction<PasswordState>>;
  reportResult: (result: ApiResult<unknown>) => void;
  completeSignOut: () => void;
}

export function usePasswordChange(
  input: Pick<PasswordContext, 'reportResult' | 'completeSignOut'>,
) {
  const [state, setState] = useState<PasswordState>({ phase: 'idle', error: null, errors: {} });
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  return {
    ...state,
    submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      return submitPasswordChange({ active, state, setState, ...input }, event.currentTarget);
    },
    cancel() {
      if (!active.current || state.phase !== 'pending') return;
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

async function submitPasswordChange(context: PasswordContext, form: HTMLFormElement) {
  const { active, setState, state } = context;
  if (active.current || state.error?.uncertain) return;
  const values = passwordChangeInput(new FormData(form));
  setState((previous) => ({ ...previous, errors: values.errors }));
  if (!values.valid) return focusChangePasswordError(form, values.errors);
  const controller = new AbortController();
  active.current = controller;
  setState((previous) => ({ ...previous, phase: 'pending', error: null }));
  const result = await requestApi({
    operation: 'identity.changePassword',
    body: values.body,
    response: emptyResponseSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted || active.current !== controller) return;
  context.reportResult(result);
  if (result.ok) {
    setState((previous) => ({ ...previous, phase: 'navigating' }));
    return context.completeSignOut();
  }
  active.current = null;
  const errors: PasswordChangeErrors =
    result.error.code === 'invalid_credentials' ? { currentPassword: 'currentIncorrect' } : {};
  setState({ phase: 'idle', error: result, errors });
}
