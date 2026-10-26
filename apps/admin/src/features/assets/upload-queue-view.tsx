'use client';

import { Button } from '@new-cms/ui/actions';
import { Banner, Progress } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { PollingFeedback } from '../jobs/polling-feedback';
import { workStatus } from '../jobs/work-copy';
import { assetMessages } from './messages';
import type { QueueUpload, UploadQueueController } from './upload-queue-types';

export function uploadActive(item: QueueUpload) {
  return !['consumed', 'failed', 'cancelled'].includes(item.stage);
}

function UploadActions({
  item,
  controller,
  createLink,
}: {
  item: QueueUpload;
  controller: UploadQueueController;
  createLink: string | null;
}) {
  const t = assetMessages[useShell((state) => state.locale)];
  const navigation = useAppNavigation();
  return (
    <div className="flex flex-wrap gap-2">
      {item.stage === 'ready' && createLink ? (
        <Button size="sm" onClick={() => navigation.push(createLink)}>
          {t.createDocument}
        </Button>
      ) : null}
      {uploadActive(item) && item.stage !== 'consumed' ? (
        <Button variant="outline" size="sm" onClick={() => controller.cancel(item.id)}>
          {t.cancel}
        </Button>
      ) : null}
      {item.stage === 'blocked' ? (
        <Button variant="outline" size="sm" onClick={() => controller.verify(item.id)}>
          {t.verify}
        </Button>
      ) : null}
      {item.stage === 'failed' || item.stage === 'cancelled' ? (
        <Button variant="outline" size="sm" onClick={() => controller.retry(item.id)}>
          {t.newSession}
        </Button>
      ) : null}
      {['queued', 'failed', 'cancelled', 'consumed'].includes(item.stage) ? (
        <Button variant="ghost" size="sm" onClick={() => controller.remove(item.id)}>
          {t.remove}
        </Button>
      ) : null}
    </div>
  );
}

export function UploadQueueView({
  items,
  controller,
  collection,
  linkReady,
  readOnly = false,
}: {
  items: readonly QueueUpload[];
  controller: UploadQueueController;
  collection: string;
  linkReady: boolean;
  readOnly?: boolean;
}) {
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  return (
    <ul className="space-y-3" aria-label={t.upload}>
      {items.map((item) => (
        <li
          key={item.id}
          className="min-w-0 space-y-3 rounded-xl border border-border/60 bg-card p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="break-all text-sm font-medium">{item.file.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.file.type} · {new Intl.NumberFormat(locale).format(item.file.size)} B
              </p>
            </div>
            <span className="text-sm text-muted-foreground">{workStatus(item.stage, t)}</span>
          </div>
          {item.stage === 'uploading' ? (
            <Progress
              label={t.transferred}
              value={item.progress.total === null ? null : item.progress.loaded}
              max={item.progress.total ?? item.file.size}
              valueLabel={`${item.progress.loaded}${item.progress.total === null ? '' : ` / ${item.progress.total}`} B`}
            />
          ) : null}
          {item.stage === 'processing' ? (
            <p className="text-xs text-muted-foreground">{t.received}</p>
          ) : null}
          {item.stage === 'ready' ? <Banner>{t.readyNotice}</Banner> : null}
          {item.stage === 'consumed' ? <Banner tone="success">{t.consumedNotice}</Banner> : null}
          {item.session?.failureCode ? (
            <p className="break-all text-sm text-destructive">
              {t.failureCode}: {item.session.failureCode}
            </p>
          ) : null}
          <ManagementFeedback error={item.error} />
          <PollingFeedback
            paused={item.paused}
            retryAt={item.retryAt}
            onResume={() => controller.verify(item.id)}
          />
          {!readOnly ? (
            <UploadActions
              item={item}
              controller={controller}
              createLink={
                linkReady && item.session
                  ? `/dashboard/collections/${collection}/new?uploadId=${item.session.id}`
                  : null
              }
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
