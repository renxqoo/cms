'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { reloadRestoredSession } from './session-navigation';

export function RestoredSessionBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    const surface = document.body;
    let previous: { visibility: string; inert: boolean } | null = null;
    function hideForCache(event: PageTransitionEvent) {
      if (!event.persisted) return;
      previous ??= { visibility: surface.style.visibility, inert: surface.inert };
      surface.inert = true;
      surface.style.visibility = 'hidden';
    }
    function revalidate(event: PageTransitionEvent) {
      if (event.persisted) reloadRestoredSession();
    }
    window.addEventListener('pagehide', hideForCache);
    window.addEventListener('pageshow', revalidate);
    return () => {
      window.removeEventListener('pagehide', hideForCache);
      window.removeEventListener('pageshow', revalidate);
      if (previous) {
        surface.style.visibility = previous.visibility;
        surface.inert = previous.inert;
      }
    };
  }, []);
  return children;
}
