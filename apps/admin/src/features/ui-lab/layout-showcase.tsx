'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, buttonStyles } from '@new-cms/ui/actions';
import {
  AnimateHeight,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  Gutter,
} from '@new-cms/ui/layout';
import { AppLink } from '../../components/shell/navigation/app-link';
import { LabPage } from './lab-page';
import { LabSection } from './lab-section';

export function LayoutShowcase() {
  const t = useTranslations('layout');
  const [open, setOpen] = useState(false);
  const [paragraphs, setParagraphs] = useState(1);
  return (
    <LabPage category="layout">
      <LabSection title={t('cards')} description={t('cardDescription')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>OneAster</CardTitle>
              <CardDescription>{t('cardDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{t('content')}</p>
            </CardContent>
          </Card>
          <Card
            render={<AppLink href="/ui/lists" prefetch={false} />}
            className="outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CardHeader>
              <CardTitle>{t('openList')}</CardTitle>
              <CardDescription>{t('content')}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </LabSection>
      <LabSection title={t('collapse')} description={t('collapseDescription')}>
        <Collapsible open={open} onOpenChange={setOpen} title={t('collapsedTitle')}>
          <p className="text-sm text-muted-foreground">{t('content')}</p>
        </Collapsible>
        <Collapsible open={false} onOpenChange={() => {}} disabled title={t('disabledTitle')}>
          <p>{t('content')}</p>
        </Collapsible>
      </LabSection>
      <LabSection
        title={t('height')}
        description={t('heightDescription')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setParagraphs((value) => value + 1)}>
              {t('add')}
            </Button>
            <Button
              variant="ghost"
              disabled={paragraphs <= 1}
              onClick={() => setParagraphs((value) => Math.max(1, value - 1))}
            >
              {t('remove')}
            </Button>
          </div>
        }
      >
        <AnimateHeight durationMs={180}>
          <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {Array.from({ length: paragraphs }, (_, index) => (
              <p key={index}>{t('paragraph', { number: index + 1 })}</p>
            ))}
          </div>
        </AnimateHeight>
      </LabSection>
      <LabSection title={t('gutter')} description={t('gutterDescription')}>
        <Gutter className="rounded-lg bg-muted/40 py-4">
          <p className="text-sm">{t('gutterContent')}</p>
          <AppLink href="/ui/lists" className={buttonStyles({ variant: 'link' })}>
            {t('openList')}
          </AppLink>
        </Gutter>
      </LabSection>
    </LabPage>
  );
}
