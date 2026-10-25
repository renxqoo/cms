'use client';

import { useEffect, useState } from 'react';
import type { RelationshipInputProps, RelationshipOption } from './relationship-types';

export function useRelationshipOptions(
  props: RelationshipInputProps,
  query: string,
  collection: string | null,
) {
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<{
    key: string;
    load: RelationshipInputProps['loadOptions'];
    status: 'ready' | 'error';
    options: readonly RelationshipOption[];
  } | null>(null);
  const load = props.loadOptions;
  const key = JSON.stringify([query, collection, retry]);
  useEffect(() => {
    const controller = new AbortController();
    if (load)
      void Promise.resolve()
        .then(() => load({ query, collection, signal: controller.signal }))
        .then(
          (options) => {
            if (!controller.signal.aborted) setRemote({ key, load, status: 'ready', options });
            return null;
          },
          () => {
            if (!controller.signal.aborted) setRemote({ key, load, status: 'error', options: [] });
            return null;
          },
        );
    return () => controller.abort();
  }, [load, query, collection, key]);
  const current = remote?.key === key && remote.load === load ? remote : null;
  const allowed = new Set(props.collections.map((item) => item.id));
  const options = (load ? (current?.options ?? []) : props.options).filter(
    (option) =>
      allowed.has(option.collection) &&
      (collection === null || option.collection === collection) &&
      (load !== undefined || option.label.toLowerCase().includes(query.toLowerCase())) &&
      (props.filterOption?.(option) ?? true),
  );
  return {
    options,
    status: load ? (current?.status ?? 'loading') : 'ready',
    retry: () => setRetry((value) => value + 1),
  };
}
