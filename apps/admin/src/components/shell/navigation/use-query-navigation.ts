'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createQueryNavigation } from './query-controller';

export function useQueryNavigation(committedSearch: string) {
  const [navigation] = useState(() => createQueryNavigation(committedSearch));
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
