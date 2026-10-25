'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';

export default function WorkbenchError({ reset }: { reset: () => void }) {
  const t = useTranslations('error');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Banner tone="error">{t('description')}</Banner>
      <Button onClick={reset}>{t('retry')}</Button>
    </div>
  );
}
