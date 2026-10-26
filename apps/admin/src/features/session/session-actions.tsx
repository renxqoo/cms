'use client';

import { createContext, useContext } from 'react';

interface SessionActions {
  signOut: () => Promise<void>;
  completeSignOut: () => void;
}

const SessionActionsContext = createContext<SessionActions | null>(null);
export const SessionActionsProvider = SessionActionsContext.Provider;

export function useSessionActions(): SessionActions {
  const actions = useContext(SessionActionsContext);
  if (!actions) throw new Error('SessionActionsProvider is required');
  return actions;
}
