'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Me } from '../../contracts/auth';
import type { ApiResult } from '../../api/result';
import { createAccessController } from './controller';
import type { AccessState, OperationScope } from './controller';
import { replaceExpiredSession } from './session-navigation';

interface AccessContextValue extends AccessState {
  principal: Me;
  can: (operationId: string, scope?: OperationScope) => boolean;
  refresh: () => void;
  reportResult: (result: ApiResult<unknown>) => void;
}

const AccessContext = createContext<AccessContextValue | null>(null);

function AccessScope({ principal, children }: { principal: Me; children: ReactNode }) {
  const [controller] = useState(() => createAccessController(replaceExpiredSession));
  const state = useStore(controller.store);
  const source = JSON.stringify([principal.roleId, principal.role.status, principal.status]);
  const { source: snapshotSource, ...snapshot } = state;
  const matches = snapshotSource === source;
  const current: AccessState = matches
    ? snapshot
    : { phase: 'loading', operations: [], navigation: [], error: null };
  function can(operationId: string, scope?: OperationScope) {
    return matches && controller.can(operationId, scope);
  }
  const refresh = useCallback(() => {
    void controller.refresh();
  }, [controller]);
  useEffect(() => {
    void controller.start(source);
    return () => controller.dispose();
  }, [controller, source]);
  return (
    <AccessContext.Provider
      value={{
        ...current,
        principal,
        can,
        refresh,
        reportResult: controller.reportResult,
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}

export function AccessProvider({ principal, children }: { principal: Me; children: ReactNode }) {
  return (
    <AccessScope key={principal.id} principal={principal}>
      {children}
    </AccessScope>
  );
}

export function useAccessControl(): AccessContextValue {
  const context = useContext(AccessContext);
  if (!context) throw new Error('AccessProvider is required');
  return context;
}
