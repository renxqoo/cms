'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import { emptyResponseSchema } from '../../contracts/auth';
import { focusPasswordError, passwordConfirmation } from './password-rules';
import type { PasswordErrors } from './password-rules';
import type { PasswordAction } from './recovery-messages';
import type { RecoveryFailure } from './recovery-feedback';

export function usePasswordAction({
  kind,
  token,
  forget,
}: {
  kind: PasswordAction;
  token: string | null | undefined;
  forget: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'success'>('idle');
  const [error, setError] = useState<RecoveryFailure | null>(null);
  const [errors, setErrors] = useState<PasswordErrors>({});
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
    if (active.current || !token || error?.uncertain) return;
    const values = passwordConfirmation(new FormData(event.currentTarget));
    setErrors(values.errors);
    if (!values.valid) return focusPasswordError(event.currentTarget, values.errors);
    const controller = new AbortController();
    active.current = controller;
    setPhase('pending');
    setError(null);
    const result = await requestApi({
      operation: kind === 'invitation' ? 'identity.acceptInvitation' : 'identity.resetPassword',
      body: { token, newPassword: values.newPassword },
      response: emptyResponseSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted || active.current !== controller) return;
    active.current = null;
    setPhase(result.ok ? 'success' : 'idle');
    if (result.ok) forget();
    else setError(result);
  }
  return { phase, error, errors, submit, cancel };
}
