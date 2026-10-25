'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useLoading } from '@new-cms/ui/feedback';
import { useNavigationState } from './navigation/provider';

export function NavigationProgress() {
  const t = useTranslations('shell');
  const { active, lastEvent, failed } = useNavigationState();
  const { begin } = useLoading();
  useEffect(() => (active ? begin('route-navigation') : undefined), [active, begin]);
  return (
    <>
      {active && (
        <div
          role="progressbar"
          aria-label={t('navigationLoading')}
          className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/15"
        >
          <div className="h-full w-1/3 animate-pulse bg-primary motion-reduce:animate-none" />
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {failed
          ? t('navigationError')
          : lastEvent?.status === 'complete'
            ? t('navigationComplete')
            : lastEvent?.status === 'cancel'
              ? t('navigationCancel')
              : active
                ? t('navigationLoading')
                : ''}
      </span>
    </>
  );
}
