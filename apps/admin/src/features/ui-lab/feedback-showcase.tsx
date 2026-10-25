'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import {
  Banner,
  ErrorPill,
  LoadingIndicator,
  Pill,
  Progress,
  Skeleton,
  useLoading,
  useToast,
} from '@new-cms/ui/feedback';
import { Checkbox, Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { LabPage } from './lab-page';
import { LabSection } from './lab-section';

function NoticesExample() {
  const t = useTranslations('feedback');
  const [visible, setVisible] = useState(true);
  const field = useRef<HTMLInputElement>(null);
  return (
    <LabSection title={t('notices')}>
      {visible ? (
        <Banner>
          <div className="flex items-center justify-between gap-3">
            <span>{t('info')}</span>
            <Button variant="ghost" size="sm" onClick={() => setVisible(false)}>
              {t('dismiss')}
            </Button>
          </div>
        </Banner>
      ) : (
        <Button variant="outline" onClick={() => setVisible(true)}>
          {t('showNotice')}
        </Button>
      )}
      <Banner tone="success">{t('success')}</Banner>
      <Banner tone="warning">{t('warning')}</Banner>
      <Banner tone="error">{t('error')}</Banner>
      <ErrorPill
        count={1}
        label={t('errorCount', { count: 1 })}
        onClick={() => field.current?.focus()}
      />
      <Field id="feedback-invalid-field" label={t('field')} error={t('fieldError')}>
        <Input ref={field} />
      </Field>
    </LabSection>
  );
}

function ProgressExample() {
  const t = useTranslations('feedback');
  const [value, setValue] = useState(40);
  const [indeterminate, setIndeterminate] = useState(false);
  const [loading, setLoading] = useState(true);
  return (
    <LabSection title={t('progress')}>
      <Progress
        value={indeterminate ? null : value}
        max={100}
        label={t('progressLabel')}
        valueLabel={indeterminate ? t('indeterminate') : t('progressValue', { value })}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={value >= 100}
          onClick={() => setValue((current) => Math.min(100, current + 10))}
        >
          {t('increase')}
        </Button>
        <Button
          variant="outline"
          disabled={value <= 0}
          onClick={() => setValue((current) => Math.max(0, current - 10))}
        >
          {t('decrease')}
        </Button>
      </div>
      <Checkbox
        label={t('indeterminate')}
        checked={indeterminate}
        onCheckedChange={setIndeterminate}
      />
      <Checkbox label={t('skeleton')} checked={loading} onCheckedChange={setLoading} />
      {loading ? (
        <div className="space-y-2" aria-label={t('skeleton')}>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('loaded')}</p>
      )}
    </LabSection>
  );
}

function LoadingExample() {
  const t = useTranslations('feedback');
  const { begin, count, sources } = useLoading();
  const tasks = useRef(new Map<string, () => void>());
  useEffect(() => {
    const { current } = tasks;
    return () => {
      for (const release of current.values()) release();
      current.clear();
    };
  }, []);
  function start(source: string) {
    if (!tasks.current.has(source)) tasks.current.set(source, begin(source));
  }
  function finish(source: string) {
    tasks.current.get(source)?.();
    tasks.current.delete(source);
  }
  return (
    <LabSection title={t('shared')} description={t('sharedDescription')}>
      <div className="flex flex-wrap gap-2">
        {(['A', 'B'] as const).map((name) => (
          <div key={name} className="flex gap-2">
            <Button
              variant="outline"
              disabled={sources.includes(`workbench-${name}`)}
              onClick={() => start(`workbench-${name}`)}
            >
              {t(name === 'A' ? 'startA' : 'startB')}
            </Button>
            <Button
              variant="ghost"
              disabled={!sources.includes(`workbench-${name}`)}
              onClick={() => finish(`workbench-${name}`)}
            >
              {t(name === 'A' ? 'finishA' : 'finishB')}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm">{t('taskCount', { count })}</p>
      <LoadingIndicator label={t('loading')} />
    </LabSection>
  );
}

function PillsExample() {
  const t = useTranslations('feedback');
  const [tags, setTags] = useState<readonly ('draft' | 'featured')[]>(['draft', 'featured']);
  return (
    <LabSection
      title={t('pills')}
      actions={
        <Button variant="ghost" size="sm" onClick={() => setTags(['draft', 'featured'])}>
          {t('reset')}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Pill
            key={tag}
            tone={tag === 'draft' ? 'neutral' : 'success'}
            removeLabel={t('remove', { label: t(tag) })}
            onRemove={() => setTags((current) => current.filter((value) => value !== tag))}
          >
            {t(tag)}
          </Pill>
        ))}
      </div>
    </LabSection>
  );
}

function ToastExample() {
  const t = useTranslations('feedback');
  const { notify, dismiss } = useToast();
  const [tone, setTone] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [latest, setLatest] = useState<string | number | null>(null);
  return (
    <LabSection title={t('notifications')}>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label={t('toastTone')}
          value={tone}
          className="w-40"
          onChange={(event) => {
            const { value } = event.currentTarget;
            if (value === 'info' || value === 'success' || value === 'warning' || value === 'error')
              setTone(value);
          }}
        >
          {(['info', 'success', 'warning', 'error'] as const).map((value) => (
            <option key={value} value={value}>
              {t(`${value}Tone`)}
            </option>
          ))}
        </NativeSelect>
        <Button
          onClick={() => setLatest(notify({ message: t('toastMessage'), tone, durationMs: 3000 }))}
        >
          {t('showToast')}
        </Button>
        <Button
          variant="ghost"
          disabled={latest === null}
          onClick={() => {
            if (latest !== null) dismiss(latest);
            setLatest(null);
          }}
        >
          {t('dismissToast')}
        </Button>
      </div>
    </LabSection>
  );
}

export function FeedbackShowcase() {
  return (
    <LabPage category="feedback">
      <NoticesExample />
      <ProgressExample />
      <LoadingExample />
      <PillsExample />
      <ToastExample />
    </LabPage>
  );
}
