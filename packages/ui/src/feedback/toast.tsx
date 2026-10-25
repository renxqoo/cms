'use client';

import { createContext, useContext, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Toaster, toast } from 'sonner';

export interface ToastInput {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  durationMs: number;
}

interface ToastApi {
  notify: (input: ToastInput) => string | number;
  dismiss: (id: string | number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({
  children,
  theme,
  closeLabel,
  label,
}: {
  children: ReactNode;
  theme: 'light' | 'dark';
  closeLabel: string;
  label: string;
}) {
  const id = useId();
  const active = useRef(new Set<string | number>());
  useEffect(() => {
    const toasts = active.current;
    return () => {
      for (const key of toasts) toast.dismiss(key);
      toasts.clear();
    };
  }, []);
  function dismiss(key: string | number) {
    if (!active.current.has(key)) return;
    toast.dismiss(key);
    active.current.delete(key);
  }
  function notify({ message, tone = 'info', durationMs }: ToastInput) {
    const key = toast[tone](message, {
      toasterId: id,
      duration: durationMs,
      closeButton: true,
      onDismiss: (item) => active.current.delete(item.id),
      onAutoClose: (item) => active.current.delete(item.id),
    });
    active.current.add(key);
    return key;
  }
  return (
    <ToastContext.Provider value={{ notify, dismiss }}>
      {children}
      <Toaster
        id={id}
        theme={theme}
        containerAriaLabel={label}
        toastOptions={{
          closeButtonAriaLabel: closeLabel,
          classNames: {
            toast: '!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-md',
            description: '!text-muted-foreground',
          },
        }}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('ToastProvider is required');
  return api;
}
