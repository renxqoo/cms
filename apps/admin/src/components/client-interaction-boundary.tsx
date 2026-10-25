'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useClientReady } from './use-client-ready';

export function ClientInteractionBoundary({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className: string;
  as?: 'div' | 'main';
}) {
  const ready = useClientReady();
  const t = useTranslations('shell');
  return (
    <>
      {!ready ? (
        <p role="status" className="sr-only">
          {t('preparing')}
        </p>
      ) : null}
      <Tag inert={!ready} aria-busy={!ready} className={className}>
        {children}
      </Tag>
    </>
  );
}
