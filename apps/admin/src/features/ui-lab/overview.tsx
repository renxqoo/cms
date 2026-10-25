'use client';

import { ArrowRightIcon, LayersIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonStyles } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { DataTable } from '@new-cms/ui/data';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@new-cms/ui/layout';
import { AppLink } from '../../components/shell/navigation/app-link';
import { categoryCatalog, categoryIds, coverageRows } from './catalog';
import { createCoverageColumns } from './coverage-columns';

export function Overview() {
  const t = useTranslations('overview');
  const copy = useTranslations('catalog');
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title={t('title')}
        description={copy('overviewDescription')}
        icon={<LayersIcon />}
      />
      <Banner>{t('notice')}</Banner>
      <Card>
        <CardHeader>
          <CardTitle>{t('listTitle')}</CardTitle>
          <CardDescription>{t('listDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AppLink href="/ui/lists" prefetch={false} className={buttonStyles()}>
            {t('open')}
            <ArrowRightIcon />
          </AppLink>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categoryIds.map((category) => {
          const definition = categoryCatalog[category];
          const Icon = definition.icon;
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="size-4" />
                  {copy(`${category}Title`)}
                </CardTitle>
                <CardDescription>{copy(`${category}Description`)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  {copy('guides', { count: definition.guides.length })}
                </p>
                <AppLink
                  href={`/ui/${category}`}
                  prefetch={false}
                  className={buttonStyles({ variant: 'outline', size: 'sm' })}
                >
                  {copy('open')}
                  <ArrowRightIcon />
                </AppLink>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{copy('coverage')}</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={createCoverageColumns(copy)}
            rows={coverageRows}
            rowKey={(row) => row.guide}
            emptyLabel={copy('emptyCoverage')}
            loadingLabel={copy('loading')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
