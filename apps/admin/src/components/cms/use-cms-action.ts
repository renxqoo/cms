'use client';

import { useEffect, useRef, useState } from 'react';
import type { AsyncResult } from '@new-cms/ui/overlays';

interface Operation {
  controller: AbortController;
  scope: string;
}

export function useCmsAction(errorLabel: string, scope = '') {
  const active = useRef<Operation | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [failure, setFailure] = useState<{ scope: string; message: string } | null>(null);
  useEffect(() => {
    if (operation?.scope !== scope) operation?.controller.abort();
    return () => operation?.controller.abort();
  }, [operation, scope]);
  useEffect(
    () => () => {
      active.current?.controller.abort();
    },
    [],
  );
  function cancel() {
    active.current?.controller.abort();
    active.current = null;
    setOperation(null);
    setFailure(null);
  }
  async function run(
    action: (signal: AbortSignal) => Promise<AsyncResult>,
  ): Promise<AsyncResult | null> {
    if (active.current?.scope === scope && !active.current.controller.signal.aborted) return null;
    active.current?.controller.abort();
    const controller = new AbortController();
    const next = { controller, scope };
    active.current = next;
    setOperation(next);
    setFailure(null);
    let result: AsyncResult;
    try {
      result = await action(controller.signal);
    } catch {
      result = { status: 'error', message: errorLabel };
    }
    if (controller.signal.aborted || active.current !== next) return null;
    active.current = null;
    setOperation(null);
    if (result.status === 'error') setFailure({ scope, message: result.message });
    return result;
  }
  return {
    run,
    cancel,
    error: failure?.scope === scope ? failure.message : null,
    busy: operation?.scope === scope && !operation.controller.signal.aborted,
  };
}
