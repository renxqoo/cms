'use client';

import type { ReactNode } from 'react';
import { RegisteredCollection } from './renderers';
import type { CollectionComponentProps } from './types';

export function CollectionPresentation({
  kind,
  children,
  ...props
}: CollectionComponentProps & { kind: 'list' | 'edit'; children: ReactNode }) {
  const slots =
    kind === 'list'
      ? ({ body: 'List', before: 'beforeList', after: 'afterList' } as const)
      : ({ body: 'Edit', before: 'beforeEdit', after: 'afterEdit' } as const);
  return (
    <RegisteredCollection {...props} slot={slots.body}>
      <RegisteredCollection {...props} slot={slots.before} />
      {children}
      <RegisteredCollection {...props} slot={slots.after} />
    </RegisteredCollection>
  );
}
