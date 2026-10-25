'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/client';
import { loginResponseSchema } from '../../contracts/auth';
import { validateLogin } from './login-input';
import type { LoginInputErrors, LoginValues } from './login-input';
import { replaceAfterLogin } from './login-navigation';

type LoginFailure = Extract<ApiResult<unknown>, { ok: false }>;
export type LoginFeedback = LoginFailure | 'cancelled' | null;

export function useLoginFlow(next: string) {
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginInputErrors>({});
  const [feedback, setFeedback] = useState<LoginFeedback>(null);
  const [phase, setPhase] = useState<'idle' | 'pending' | 'navigating'>('idle');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function change(field: keyof LoginValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function cancel() {
    if (phase !== 'pending') return;
    active.current?.abort();
    active.current = null;
    setPhase('idle');
    setFeedback('cancelled');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current) return;
    const entered = enteredCredentials(event.currentTarget);
    setValues(entered);
    const input = validateLogin(entered);
    setErrors(input.ok ? {} : input.errors);
    if (!input.ok) return focusLoginError(event.currentTarget, input.errors);
    const controller = new AbortController();
    active.current = controller;
    setFeedback(null);
    setPhase('pending');
    const result = await requestApi({
      operation: 'identity.login',
      body: input.values,
      response: loginResponseSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted || active.current !== controller) return;
    if (result.ok) {
      setPhase('navigating');
      return replaceAfterLogin(next);
    }
    active.current = null;
    setPhase('idle');
    setFeedback(result);
    setErrors(loginFieldErrors(result));
  }

  return { values, errors, feedback, phase, change, cancel, submit };
}

function focusLoginError(form: HTMLFormElement, errors: LoginInputErrors) {
  const control = form.elements.namedItem(errors.email ? 'email' : 'password');
  if (control instanceof HTMLElement) control.focus();
}

function loginFieldErrors(result: LoginFailure): LoginInputErrors {
  const errors: LoginInputErrors = {};
  if (result.error.code !== 'invalid_input') return errors;
  for (const item of result.error.fieldErrors ?? []) {
    if (item.field === 'email' || item.field === 'password') errors[item.field] = 'fieldInvalid';
  }
  return errors;
}

function enteredCredentials(form: HTMLFormElement): LoginValues {
  const data = new FormData(form);
  const email = data.get('email');
  const password = data.get('password');
  return {
    email: typeof email === 'string' ? email : '',
    password: typeof password === 'string' ? password : '',
  };
}
