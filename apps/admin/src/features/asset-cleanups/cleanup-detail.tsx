'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@new-cms/ui/overlays';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { UnsavedChangesGuard } from '../../components/cms/unsaved-changes';
import { cleanupEntrySchema, cleanupRetryReceiptSchema } from '../../contracts/cleanups';
import type { CleanupEntry } from '../../contracts/cleanups';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { usePollingQuery } from '../jobs/use-polling-query';
import { useWorkAction } from '../jobs/use-work-action';
import { discoveryPolicy } from '../jobs/policy';
import { PollingFeedback } from '../jobs/polling-feedback';
import { WorkValues, workTime } from '../jobs/work-values';
import { cleanupMessages } from './messages';

const active = (entry: CleanupEntry) => !entry.blocked && entry.state !== 'deleted';

function useCleanupDetail(id: string) {
  const access = useAccessControl();
  const canRead = access.can('assets.getCleanup');
  const entry = usePollingQuery({
    operation: 'assets.getCleanup',
    params: { id },
    response: cleanupEntrySchema,
    enabled: canRead,
    intervalMs: discoveryPolicy.detailIntervalMs,
    active,
  });
  const current = canRead ? entry.data : null;
  const retryAllowed = canRead && access.can('assets.retryCleanup');
  const retry = useWorkAction({
    operation: 'assets.retryCleanup',
    params: { id },
    response: cleanupRetryReceiptSchema,
    body: {},
    idempotent: true,
    allowed: retryAllowed && entry.phase === 'ready',
  });
  const canRetry = retryAllowed && current?.blocked === true && current.state !== 'deleted';
  const replay = retryAllowed && retry.phase === 'unconfirmed';
  const locked = retry.phase === 'pending' || (retryAllowed && retry.phase === 'unconfirmed');
  return { entry, current, canRead, canRetry: canRetry || replay, locked, retry };
}

type DetailState = ReturnType<typeof useCleanupDetail>;

export function CleanupDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locale = useShell((shell) => shell.locale);
  const t = cleanupMessages[locale];
  const { adapter } = useAppNavigation();
  const state = useCleanupDetail(id);
  return (
    <UnsavedChangesGuard dirty={state.locked} navigation={adapter} labels={leaveLabels(locale)}>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !state.locked) onClose();
        }}
      >
        <DialogContent
          closeLabel={t.close}
          showCloseButton={!state.locked}
          className="sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>
              {t.title} · {t.details}
            </DialogTitle>
            <DialogDescription>{t.hint}</DialogDescription>
          </DialogHeader>
          <ManagementFeedback error={state.entry.error} onRetry={state.entry.resume} />
          <CleanupContents state={state} locale={locale} />
          <CleanupActions state={state} onChanged={onChanged} onClose={onClose} />
        </DialogContent>
      </Dialog>
    </UnsavedChangesGuard>
  );
}

function leaveLabels(locale: 'en' | 'zh') {
  return locale === 'zh'
    ? {
        title: '离开未确认的操作？',
        description: '清理重试的结果可能尚未确认。',
        confirm: '离开',
        cancel: '继续核实',
        close: '关闭',
      }
    : {
        title: 'Leave an unconfirmed operation?',
        description: 'The cleanup retry may not be confirmed.',
        confirm: 'Leave',
        cancel: 'Keep checking',
        close: 'Close',
      };
}

function CleanupContents({ state, locale }: { state: DetailState; locale: 'en' | 'zh' }) {
  const t = cleanupMessages[locale];
  const { current, retry, entry } = state;
  if (!state.canRead) return <Banner tone="warning">{t.denied}</Banner>;
  return (
    <>
      <PollingFeedback expired={entry.expired} observing={entry.observing} resume={entry.resume} />
      {current ? <CleanupValues entry={current} locale={locale} /> : <p>{t.readFirst}</p>}
      {current && !state.canRetry ? (
        <p className="text-sm text-muted-foreground">{t.notBlocked}</p>
      ) : null}
      <ManagementFeedback error={retry.error} />
      {retry.phase === 'done' ? <Banner tone="success">{t.accepted}</Banner> : null}
      {retry.phase === 'unconfirmed' ? <Banner tone="warning">{t.uncertain}</Banner> : null}
    </>
  );
}

function CleanupValues({ entry, locale }: { entry: CleanupEntry; locale: 'en' | 'zh' }) {
  const t = cleanupMessages[locale];
  return (
    <WorkValues
      values={[
        [t.id, entry.id],
        [t.state, t[entry.state]],
        [t.blocked, entry.blocked ? t.yes : t.no],
        [t.attempts, entry.attempts],
        [t.failure, entry.failureCode],
        [t.retain, workTime(entry.retainUntil, locale)],
        [t.deadline, workTime(entry.writeDeadline, locale)],
        [t.next, workTime(entry.nextCleanupAt, locale)],
        [t.created, workTime(entry.createdAt, locale)],
      ]}
    />
  );
}

function CleanupActions({
  state,
  onChanged,
  onClose,
}: {
  state: DetailState;
  onChanged: () => void;
  onClose: () => void;
}) {
  const locale = useShell((shell) => shell.locale);
  const t = cleanupMessages[locale];
  const { retry, entry } = state;
  async function retryCleanup() {
    await retry.run();
    entry.resume();
    onChanged();
  }
  return (
    <DialogFooter className="flex-wrap">
      <Button variant="outline" onClick={entry.resume} disabled={retry.phase === 'pending'}>
        {t.refresh}
      </Button>
      {state.canRetry ? (
        <Button
          disabled={entry.phase !== 'ready' || retry.phase === 'done'}
          busy={retry.phase === 'pending'}
          onClick={() => {
            void retryCleanup();
          }}
        >
          {retry.phase === 'unconfirmed' ? t.retrySame : t.retry}
        </Button>
      ) : null}
      <Button variant="outline" disabled={state.locked} onClick={onClose}>
        {t.close}
      </Button>
    </DialogFooter>
  );
}
