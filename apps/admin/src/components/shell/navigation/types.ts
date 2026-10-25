export interface NavigationAttempt {
  id: string;
  href: string;
  kind: 'push' | 'replace' | 'traverse';
}

export interface NavigationAdapter {
  subscribe: (listener: (attempt: NavigationAttempt) => void) => () => void;
  commit: (attempt: NavigationAttempt) => void;
  cancel: (attempt: NavigationAttempt) => void;
}

export interface NavigationEvent {
  attempt: NavigationAttempt;
  status: 'start' | 'complete' | 'cancel';
}

export interface NavigationState {
  active: NavigationAttempt | null;
  lastEvent: NavigationEvent | null;
  failed: boolean;
}
