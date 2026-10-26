'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { requestApi } from '../../api/client';
import type { ApiQuery } from '../management-shared/query';
import { useAccessControl } from '../access-control/provider';
import { createPolling } from './polling';
import { browserVisibility } from './visibility';
import { assetWorkPolicy } from './policy';

export function usePolledQuery<T>(
  input: ApiQuery<T> & { terminal: (data: T) => boolean; intervalMs: number },
) {
  const access = useAccessControl();
  const [controller] = useState(() =>
    createPolling({
      read: (signal) =>
        requestApi({
          operation: input.operation,
          ...(input.params ? { params: input.params } : {}),
          ...(input.query ? { query: input.query } : {}),
          response: input.response,
          signal,
        }),
      terminal: input.terminal,
      onResult: access.reportResult,
      intervalMs: input.intervalMs,
      budgetMs: assetWorkPolicy.automaticWaitMs,
      visibility: browserVisibility,
    }),
  );
  const state = useStore(controller.store);
  useEffect(() => {
    if (input.enabled !== false) controller.start();
    return () => controller.dispose();
  }, [controller, input.enabled]);
  return { ...state, reload: controller.resume };
}
