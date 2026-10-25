'use client';

import { useSyncExternalStore } from 'react';
import type { ComponentProps } from 'react';

function subscribe() {
  return () => {};
}

function clientSnapshot() {
  return true;
}

function serverSnapshot() {
  return false;
}

export function useClientReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

export function ClientFieldset({ disabled, ...props }: ComponentProps<'fieldset'>) {
  const ready = useClientReady();
  return <fieldset {...props} disabled={disabled === true || !ready} aria-busy={!ready} />;
}
