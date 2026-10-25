import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { updateListQuery } from './list-query';

export interface ListQueryNavigation {
  update: (changes: Parameters<typeof updateListQuery>[1]) => string;
  observe: (search: string) => void;
  traverse: (search: string) => void;
  getSnapshot: () => string;
  subscribe: (listener: () => void) => () => void;
}

interface QueryNavigationState {
  committed: string;
  latest: string | null;
  requested: ReadonlySet<string>;
}

type QueryStore = StoreApi<QueryNavigationState>;

export function createListQueryNavigation(initialSearch: string): ListQueryNavigation {
  const store = createStore<QueryNavigationState>()(() => ({
    committed: initialSearch,
    latest: null,
    requested: new Set(),
  }));
  return {
    update: (changes) => requestQuery(store, changes),
    observe: (search) => observeQuery(store, search),
    traverse: (search) => resetQuery(store, search),
    getSnapshot: () => querySnapshot(store),
    subscribe: (listener) => store.subscribe(listener),
  };
}

function querySnapshot(store: QueryStore): string {
  const { latest, committed } = store.getState();
  return latest ?? committed;
}

function requestQuery(store: QueryStore, changes: Parameters<typeof updateListQuery>[1]) {
  const href = updateListQuery(new URLSearchParams(querySnapshot(store)), changes);
  const latest = href.split('?')[1] ?? '';
  store.setState({ latest, requested: new Set([...store.getState().requested, latest]) });
  return href;
}

function resetQuery(store: QueryStore, search: string) {
  store.setState({ committed: search, latest: null, requested: new Set() });
}

function observeQuery(store: QueryStore, search: string) {
  const { committed, latest, requested } = store.getState();
  if (search === committed) return;
  if (search === latest || !requested.has(search)) {
    resetQuery(store, search);
    return;
  }
  const remaining = new Set(requested);
  remaining.delete(search);
  store.setState({ committed: search, requested: remaining });
}
