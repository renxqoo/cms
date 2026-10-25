'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createListQueryNavigation } from './create-list-query-navigation';

export function useListQueryNavigation(committedSearch: string) {
  const [navigation] = useState(() => createListQueryNavigation(committedSearch));
  const search = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );

  useEffect(() => {
    navigation.observe(committedSearch);
  }, [navigation, committedSearch]);

  useEffect(() => {
    function handleTraversal() {
      navigation.traverse(new URLSearchParams(window.location.search).toString());
    }
    window.addEventListener('popstate', handleTraversal);
    return () => window.removeEventListener('popstate', handleTraversal);
  }, [navigation]);

  return [search, navigation.update] as const;
}
