'use client';
import { useEffect, useRef } from 'react';
export function useRevisionRefresh(revision: number | string | undefined, reload: () => void) {
  const observed = useRef(revision);
  useEffect(() => {
    if (observed.current === revision) return;
    observed.current = revision;
    reload();
  }, [revision, reload]);
}
