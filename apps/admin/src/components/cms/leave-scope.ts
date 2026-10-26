import { createStore } from 'zustand/vanilla';

export function createLeaveScope() {
  const entries = new Map<string, boolean>();
  const store = createStore<{ dirty: boolean }>(() => ({ dirty: false }));
  function publish() {
    const dirty = [...entries.values()].some(Boolean);
    if (store.getState().dirty !== dirty) store.setState({ dirty });
  }
  return {
    store,
    update(token: string, dirty: boolean) {
      if (entries.has(token) && entries.get(token) === dirty) return;
      entries.set(token, dirty);
      publish();
    },
    remove(token: string) {
      if (entries.delete(token)) publish();
    },
  };
}

export type LeaveScope = ReturnType<typeof createLeaveScope>;
