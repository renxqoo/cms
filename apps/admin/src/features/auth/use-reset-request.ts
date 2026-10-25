'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import { resetAcceptedSchema } from '../../contracts/auth';
import { authEmailSchema } from './login-input';
import { formString } from './password-rules';
import type { RecoveryFailure } from './recovery-feedback';

export function useResetRequest() {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<RecoveryFailure | null>(null);
  const [emailError, setEmailError] = useState<'emailRequired' | 'emailInvalid' | undefined>();
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  function cancel() {
    if (!active.current) return;
    active.current?.abort();
    active.current = null;
    setPhase('idle');
    setError(failure('request_cancelled', 0, { uncertain: true }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (active.current || error?.uncertain) return;
    const entered = formString(new FormData(event.currentTarget), 'email');
    const email = authEmailSchema.safeParse(entered);
    setEmailError(email.success ? undefined : emailFailure(entered));
    if (!email.success) {
      const control = event.currentTarget.elements.namedItem('email');
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPhase('pending');
    setError(null);
    const result = await requestApi({
      operation: 'identity.requestPasswordReset',
      body: { email: email.data },
      response: resetAcceptedSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted || active.current !== controller) return;
    active.current = null;
    setPhase(result.ok ? 'success' : 'idle');
    if (!result.ok) setError(result);
  }
  return { phase, error, emailError, submit, cancel };
}

function emailFailure(value: string) {
  return value.trim() ? 'emailInvalid' : 'emailRequired';
}
