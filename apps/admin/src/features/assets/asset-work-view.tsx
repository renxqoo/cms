'use client';

import { useStore } from 'zustand';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useShell } from '../../components/shell/shell-provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { PollingFeedback } from '../jobs/polling-feedback';
import { UploadQueueView } from './upload-queue-view';
import type { AssetWorkController, AssetWorkInput } from './document-work-types';
import type { UploadQueueController } from './upload-queue-types';
import { assetMessages } from './messages';

function ReplacementQueue({
  queue,
  collection,
}: {
  queue: UploadQueueController;
  collection: string;
}) {
  const { items } = useStore(queue.store);
  return (
    <UploadQueueView
      items={items}
      controller={queue}
      collection={collection}
      linkReady={false}
      readOnly
    />
  );
}

export function AssetWorkView({
  work,
  collection,
  can,
}: {
  can: AssetWorkInput['can'];
  work: AssetWorkController;
  collection: string;
}) {
  const state = useStore(work.store);
  const t = assetMessages[useShell((store) => store.locale)];
  const settled = ['succeeded', 'failed', 'cancelled'].includes(state.phase);
  const writing = state.phase === 'consuming' || state.phase === 'refreshing';
  return (
    <div className="space-y-3">
      {!settled ? (
        <Banner>{t.processingNotice}</Banner>
      ) : (
        <Banner tone={state.phase === 'succeeded' ? 'success' : 'warning'}>
          {state.phase === 'succeeded'
            ? t.consumedNotice
            : state.phase === 'failed'
              ? t.failedStatus
              : t.cancelled}
        </Banner>
      )}
      <ManagementFeedback error={state.error} />
      <PollingFeedback {...state} onResume={work.verify} />
      {state.job?.failureCode ? (
        <p className="text-sm text-destructive">
          {t.failureCode}: {state.job.failureCode}
        </p>
      ) : null}
      {work.queue ? <ReplacementQueue queue={work.queue} collection={collection} /> : null}
      {!settled ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={writing || !work.canVerify(can)}
            onClick={work.verify}
          >
            {t.verify}
          </Button>
          <Button
            variant="outline"
            disabled={writing || !work.canCancel(can)}
            onClick={work.cancel}
          >
            {t.cancel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
