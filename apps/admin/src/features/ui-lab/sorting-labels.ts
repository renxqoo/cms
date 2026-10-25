'use client';

import { useTranslations } from 'next-intl';
import type { SortableLabels } from '@new-cms/ui/data';

export function useSortingLabels(listLabel: string): SortableLabels {
  const t = useTranslations('sorting');
  return {
    listLabel,
    roleDescription: t('role'),
    invalidItemsLabel: t('invalid'),
    handleLabel: (label) => t('handle', { label }),
    instructions: t('instructions'),
    start: (label) => t('start', { label }),
    move: (label, position, total) => t('move', { label, position, total }),
    end: (label, position, total) => t('end', { label, position, total }),
    cancel: (label) => t('cancel', { label }),
  };
}
