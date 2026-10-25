'use client';

import { createContext, useContext, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from 'zustand';
import { createNavigationController } from './controller';
import type { NavigationController } from './controller';
import { createHistoryBridge } from './history';
import { safeAppHref } from './safe-href';
import type { NavigationAdapter } from './types';

interface NavigateOptions {
  scroll?: boolean;
}
interface NavigationContextValue {
  adapter: NavigationAdapter;
  controller: NavigationController;
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function AppNavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = `${pathname}${search ? `?${search}` : ''}`;
  const [controller] = useState(() => createNavigationController(href));
  const [history] = useState(() => createHistoryBridge(controller, href));

  useLayoutEffect(() => {
    const stop = history.start(window);
    return () => {
      stop();
      controller.dispose();
    };
  }, [controller, history]);
  useLayoutEffect(() => {
    history.observe(`${href}${window.location.hash}`);
  }, [href, history]);

  function navigate(target: string, kind: 'push' | 'replace', options?: NavigateOptions) {
    if (!safeAppHref(target)) return;
    const url = new URL(target, window.location.href);
    const destination = `${url.pathname}${url.search}${url.hash}`;
    if (
      url.pathname === window.location.pathname &&
      url.search === window.location.search &&
      url.hash !== window.location.hash
    ) {
      history.prepare(kind, destination);
      if (kind === 'push') window.location.hash = url.hash;
      else {
        window.history.replaceState(window.history.state, '', destination);
        history.observe(destination);
      }
      return;
    }
    controller.request({ href: destination, kind }, () => {
      history.prepare(kind, destination);
      router[kind](destination, options);
    });
  }

  return (
    <NavigationContext.Provider
      value={{
        adapter: controller.adapter,
        controller,
        push: (target, options) => navigate(target, 'push', options),
        replace: (target, options) => navigate(target, 'replace', options),
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

function useNavigationContext() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('AppNavigationProvider is required');
  return context;
}

export function useAppNavigation() {
  const { adapter, push, replace } = useNavigationContext();
  return { adapter, push, replace };
}

export function useNavigationState() {
  const { controller } = useNavigationContext();
  return useStore(controller.store);
}
