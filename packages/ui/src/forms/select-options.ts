'use client';

import { useEffect, useState } from 'react';
import type { SelectOption, SelectProps } from './select-types.ts';

interface RemoteOptions {
  query: string;
  load: NonNullable<SelectProps['loadOptions']>;
  controller: AbortController;
  status: 'success' | 'error';
  options: readonly SelectOption[];
  message?: string;
}

function useSelectedOptions(props: SelectProps, remote: RemoteOptions | null) {
  const [retained, setRetained] = useState<readonly SelectOption[]>([]);
  const remoteOptions = remote?.status === 'success' ? remote.options : [];
  const known = new Map(
    [...retained, ...remoteOptions, ...props.options].map((option) => [option.value, option]),
  );
  const values = props.multiple ? props.value : [props.value];
  const selected = values.flatMap((key) => {
    const option = key === null ? undefined : known.get(key);
    return option ? [option] : [];
  });
  if (
    selected.length !== retained.length ||
    selected.some((option, index) => option !== retained[index])
  )
    setRetained(selected);
  return selected;
}

export function useSelectOptions(props: SelectProps, query: string, open: boolean) {
  const [remote, setRemote] = useState<RemoteOptions | null>(null);
  const selected = useSelectedOptions(props, remote);
  const load = props.loadOptions;
  useEffect(() => {
    const controller = new AbortController();
    if (load && open) {
      const request = load;
      void (async () => {
        try {
          const result = await request({ query, signal: controller.signal });
          if (controller.signal.aborted) return;
          setRemote(
            result.status === 'success'
              ? { query, load: request, controller, status: 'success', options: result.options }
              : {
                  query,
                  load: request,
                  controller,
                  status: 'error',
                  options: [],
                  message: result.message,
                },
          );
        } catch {
          if (!controller.signal.aborted)
            setRemote({ query, load: request, controller, status: 'error', options: [] });
        }
      })();
    }
    return () => {
      controller.abort();
    };
  }, [load, query, open]);
  const current =
    remote?.query === query && remote.load === load && !remote.controller.signal.aborted
      ? remote
      : null;
  return {
    selected,
    options: current?.status === 'success' ? current.options : props.options,
    loading: Boolean(load && open && !current),
    error: current?.status === 'error' ? (current.message ?? props.errorLabel) : null,
  };
}
