'use client';

import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import { replaceAfterSignOut } from './session-navigation';

export function useSignOut() {
  const [state, setState] = useState<'active' | 'leaving' | 'unconfirmed'>('active');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function signOut() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState('leaving');
    const result = await requestApi({
      operation: 'identity.logout',
      response: emptyResponseSchema,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (result.ok || (result.status === 401 && result.error.code === 'unauthenticated'))
      return replaceAfterSignOut();
    active.current = null;
    setState('unconfirmed');
  }

  return { state, signOut };
}
