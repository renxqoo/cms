'use client';

import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@new-cms/ui/feedback';
import { PageHeader } from '@new-cms/ui/layout';
import { categoryCatalog } from './catalog';
import type { CategoryId } from './catalog';

export function LabPage({ category, children }: { category: CategoryId; children: ReactNode }) {
  const t = useTranslations('catalog');
  const Icon = categoryCatalog[category].icon;
  return (
    <ClientInteractionBoundary className="flex min-w-0 flex-col gap-4 md:gap-6">
      <PageHeader
        title={t(`${category}Title`)}
        description={t(`${category}Description`)}
        icon={<Icon />}
      />
      <Banner>{t('notice')}</Banner>
      {children}
    </ClientInteractionBoundary>
  );
}
