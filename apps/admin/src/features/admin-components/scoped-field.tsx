'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import type { ComponentType } from 'react';
import type { FieldComponentProps } from './types';

export function ScopedField({
  component: Custom,
  identity,
  ...props
}: FieldComponentProps & {
  component: ComponentType<FieldComponentProps>;
  identity: string;
}) {
  const invalid = useRef(new Set<string>());
  const report = useEffectEvent((key: string, error: string | null) =>
    props.onValidityChange?.(key, error),
  );
  useEffect(() => {
    const keys = invalid.current;
    if (props.readOnly) {
      for (const key of keys) report(key, null);
      keys.clear();
    }
    return () => {
      for (const key of keys) {
        if (!key.startsWith(`${identity}/`)) continue;
        report(key, null);
        keys.delete(key);
      }
    };
  }, [identity, props.readOnly]);
  function validity(key: string, error: string | null) {
    if (props.readOnly) return;
    const namespaced = `${identity}/${key}`;
    if (error === null) invalid.current.delete(namespaced);
    else invalid.current.add(namespaced);
    props.onValidityChange?.(namespaced, error);
  }
  return <Custom {...props} onValidityChange={validity} />;
}
