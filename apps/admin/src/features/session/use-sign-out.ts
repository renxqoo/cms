'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { requestApi } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import { replaceAfterSignOut } from './session-navigation';

export function useSignOut() {
  const [state, setState] = useState<'active' | 'leaving' | 'unconfirmed'>('active');
  const active = useRef<AbortController | null>(null);
  const completed = useRef(false);
  useEffect(() => () => active.current?.abort(), []);

  function completeSignOut() {
    if (completed.current) return;
    completed.current = true;
    active.current?.abort();
    active.current = null;
    flushSync(() => setState('leaving'));
    replaceAfterSignOut();
  }

  async function signOut() {
    if (active.current || completed.current) return;
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
      return completeSignOut();
    active.current = null;
    setState('unconfirmed');
  }

  return { state, signOut, completeSignOut };
}
