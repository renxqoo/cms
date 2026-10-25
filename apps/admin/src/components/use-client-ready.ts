'use client';

import { useSyncExternalStore } from 'react';

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
