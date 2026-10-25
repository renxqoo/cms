'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@new-cms/ui/actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@new-cms/ui/overlays';
import { createLeaveGuard } from './leave-guard';
import type { NavigationAdapter, NavigationAttempt } from '../shell/navigation/types';

export interface UnsavedChangesLabels {
  title: string;
  description: string;
  confirm: string;
  cancel: string;
  close: string;
}

export function useUnsavedChanges({
  dirty,
  navigation,
}: {
  dirty: boolean;
  navigation: NavigationAdapter;
}) {
  const active = useRef<ReturnType<typeof createLeaveGuard> | null>(null);
  const currentDirty = useRef(dirty);
  const [state, setState] = useState<{
    navigation: NavigationAdapter;
    pending: NavigationAttempt | null;
  }>({ navigation, pending: null });
  useEffect(() => {
    currentDirty.current = dirty;
    active.current?.setDirty(dirty);
  }, [dirty]);
  useEffect(() => {
    const guard = createLeaveGuard({
      dirty: currentDirty.current,
      navigation,
      onPendingChange: (pending) => setState({ navigation, pending }),
    });
    active.current = guard;
    const unsubscribe = navigation.subscribe(guard.request);
    return () => {
      unsubscribe();
      guard.dispose();
      if (active.current === guard) active.current = null;
    };
  }, [navigation]);
  useEffect(() => {
    function unload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    if (dirty) window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  return {
    pending: state.navigation === navigation ? state.pending : null,
    requestNavigation: (attempt: NavigationAttempt) => active.current?.request(attempt),
    confirm: () => active.current?.confirm(),
    cancel: () => active.current?.cancel(),
  };
}

export function UnsavedChangesGuard({
  dirty,
  navigation,
  labels,
  children,
}: {
  dirty: boolean;
  navigation: NavigationAdapter;
  labels: UnsavedChangesLabels;
  children: ReactNode;
}) {
  const guard = useUnsavedChanges({ dirty, navigation });
  return (
    <>
      {children}
      <Dialog
        open={guard.pending !== null}
        onOpenChange={(open) => {
          if (!open) guard.cancel();
        }}
      >
        <DialogContent closeLabel={labels.close}>
          <DialogHeader>
            <DialogTitle>{labels.title}</DialogTitle>
            <DialogDescription>{labels.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={guard.cancel}>
              {labels.cancel}
            </Button>
            <Button onClick={guard.confirm}>{labels.confirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
