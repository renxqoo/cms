'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Spinner } from './status.tsx';

interface LoadingState {
  busy: boolean;
  count: number;
  sources: readonly string[];
  begin: (source: string) => () => void;
}

const LoadingContext = createContext<LoadingState | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ReadonlyMap<symbol, string>>(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const begin = useCallback((source: string) => {
    const id = Symbol(source);
    let finished = false;
    if (mounted.current) setTasks((current) => new Map(current).set(id, source));
    return () => {
      if (finished || !mounted.current) return;
      finished = true;
      setTasks((current) => {
        const next = new Map(current);
        next.delete(id);
        return next;
      });
    };
  }, []);
  return (
    <LoadingContext.Provider
      value={{ busy: tasks.size > 0, count: tasks.size, sources: [...tasks.values()], begin }}
    >
      {children}
    </LoadingContext.Provider>
  );
}

export function useOptionalLoading() {
  return useContext(LoadingContext);
}

export function useLoading(): LoadingState {
  const state = useOptionalLoading();
  if (!state) throw new Error('LoadingProvider is required');
  return state;
}

export function LoadingIndicator({ label }: { label: string }) {
  const { busy, count } = useLoading();
  return busy ? (
    <span
      role="status"
      aria-label={label}
      data-loading-count={count}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner />
      {label}
    </span>
  ) : null;
}
