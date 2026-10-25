'use client';

import Link from 'next/link';
import { ArrowRightIcon, LayersIcon, Table2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonStyles } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@new-cms/ui/layout';

export function Overview() {
  const t = useTranslations('overview');
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader title={t('title')} description={t('description')} icon={<LayersIcon />} />
      <Banner>{t('notice')}</Banner>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Table2Icon className="size-4" />
              {t('listTitle')}
            </CardTitle>
            <CardDescription>{t('listDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/ui/lists" prefetch={false} className={buttonStyles()}>
              {t('open')}
              <ArrowRightIcon />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('foundation')}</CardTitle>
            <CardDescription>{t('foundationDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(['themes', 'languages', 'keyboard', 'responsive'] as const).map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {t(key)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
