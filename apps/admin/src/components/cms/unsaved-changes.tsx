'use client';

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
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
import { createLeaveScope } from './leave-scope';
import type { LeaveScope } from './leave-scope';
import type { NavigationAdapter, NavigationAttempt } from '../shell/navigation/types';

export interface UnsavedChangesLabels {
  title: string;
  description: string;
  confirm: string;
  cancel: string;
  close: string;
}

interface GuardProps {
  dirty: boolean;
  navigation: NavigationAdapter;
  labels: UnsavedChangesLabels;
  children: ReactNode;
}

const LeaveScopes = createContext<ReadonlyMap<NavigationAdapter, LeaveScope> | null>(null);

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

export function UnsavedChangesGuard(props: GuardProps) {
  const parents = useContext(LeaveScopes);
  const scope = parents?.get(props.navigation);
  return scope ? (
    <NestedLeaveScope scope={scope} dirty={props.dirty}>
      {props.children}
    </NestedLeaveScope>
  ) : (
    <OwnLeaveScope {...props} parents={parents} />
  );
}

function NestedLeaveScope({
  scope,
  dirty,
  children,
}: {
  scope: LeaveScope;
  dirty: boolean;
  children: ReactNode;
}) {
  const token = useId();
  useEffect(() => () => scope.remove(token), [scope, token]);
  useEffect(() => scope.update(token, dirty), [scope, token, dirty]);
  return children;
}

function OwnLeaveScope({
  parents,
  ...props
}: GuardProps & { parents: ReadonlyMap<NavigationAdapter, LeaveScope> | null }) {
  const [scope] = useState(createLeaveScope);
  const nestedDirty = useStore(scope.store, (state) => state.dirty);
  const guard = useUnsavedChanges({
    dirty: props.dirty || nestedDirty,
    navigation: props.navigation,
  });
  const scopes = useMemo(() => {
    const current = new Map(parents);
    current.set(props.navigation, scope);
    return current;
  }, [parents, props.navigation, scope]);
  return (
    <LeaveScopes.Provider value={scopes}>
      {props.children}
      <LeaveConfirmation guard={guard} labels={props.labels} />
    </LeaveScopes.Provider>
  );
}

function LeaveConfirmation({
  guard,
  labels,
}: {
  guard: ReturnType<typeof useUnsavedChanges>;
  labels: UnsavedChangesLabels;
}) {
  return (
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
  );
}
