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
import { emptyResponseSchema } from '../../contracts/auth';
import { uploadSessionSchema } from '../../contracts/assets';
import type { UploadSession } from '../../contracts/assets';
import { jobDetailSchema } from '../../contracts/jobs';
import type { JobDetail, UploadSummary } from '../../contracts/jobs';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { usePollingQuery } from './use-polling-query';
import { useWorkAction } from './use-work-action';
import { workMessages, workStatus } from './messages';
import { activeJob, activeUpload, discoveryPolicy } from './policy';
import { PollingFeedback } from './polling-feedback';
import { WorkValues } from './work-values';
import { WorkDetailValues } from './work-detail-values';

export type SelectedWork =
  | { kind: 'job'; value: { id: string; collection: string; status: string } }
  | { kind: 'upload'; value: UploadSummary };

function publicationOf(detail: UploadSession | JobDetail | null) {
  return detail && 'kind' in detail && detail.action === 'publication' ? detail : null;
}

function useWorkDetail(selected: SelectedWork) {
  const access = useAccessControl();
  const { value } = selected;
  const upload = selected.kind === 'upload';
  const scope = { scopeKind: 'collection' as const, collectionKey: value.collection };
  const canRead = access.can(upload ? 'assets.readUpload' : 'content.getJob', scope);
  const details = usePollingQuery<UploadSession | JobDetail>({
    operation: upload ? 'assets.readUpload' : 'content.getJob',
    params: upload
      ? { collection: value.collection, uploadId: value.id }
      : { collection: value.collection, jobId: value.id },
    response: upload ? uploadSessionSchema : jobDetailSchema,
    enabled: canRead,
    intervalMs: discoveryPolicy.detailIntervalMs,
    active: (data) => (upload ? activeUpload(data.status) : activeJob(data.status)),
  });
  const detail = canRead ? details.data : null;
  const publication = publicationOf(detail);
  const { cancel, cancelAllowed } = useWorkCancellation(selected, publication, canRead);
  const status = detail?.status ?? value.status;
  const cancellable = upload
    ? ['pending', 'uploading', 'processing', 'ready'].includes(status)
    : publication !== null && activeJob(status);
  return {
    details,
    detail,
    cancel,
    canRead,
    upload,
    status,
    publication,
    cancelAllowed: cancelAllowed && cancellable,
  };
}

function useWorkCancellation(
  selected: SelectedWork,
  publication: ReturnType<typeof publicationOf>,
  canRead: boolean,
) {
  const access = useAccessControl();
  const upload = selected.kind === 'upload';
  const { value } = selected;
  const scope = { scopeKind: 'collection' as const, collectionKey: value.collection };
  const cancelAllowed =
    canRead &&
    access.can(upload ? 'assets.cancelUpload' : 'content.cancelPublicationSchedule', scope);
  const cancel = useWorkAction({
    operation: upload ? 'assets.cancelUpload' : 'content.cancelPublicationSchedule',
    params: upload
      ? { collection: value.collection, uploadId: value.id }
      : { collection: value.collection, id: publication?.documentId ?? '', scheduleId: value.id },
    response: emptyResponseSchema,
    allowed: cancelAllowed && (upload || publication?.documentId != null),
  });
  return { cancel, cancelAllowed };
}

type WorkState = ReturnType<typeof useWorkDetail>;

export function WorkDetail({
  selected,
  onClose,
  onChanged,
}: {
  selected: SelectedWork;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locale = useShell((shell) => shell.locale);
  const t = workMessages[locale];
  const state = useWorkDetail(selected);
  const pending = state.cancel.phase === 'pending';
  const serverCancelled = state.details.phase === 'ready' && state.detail?.status === 'cancelled';
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent closeLabel={t.close} showCloseButton={!pending} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {state.upload ? t.uploads : t.jobs} · {t.details}
          </DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <ManagementFeedback error={state.details.error} onRetry={state.details.resume} />
        {state.canRead ? (
          <>
            <PollingFeedback
              expired={state.details.expired}
              observing={state.details.observing}
              resume={state.details.resume}
            />
            <WorkValues
              values={[
                [t.id, selected.value.id],
                [t.collection, selected.value.collection],
                [t.status, workStatus(state.status, t)],
              ]}
            />
            <WorkDetailValues detail={state.detail} locale={locale} />
            <ManagementFeedback
              error={serverCancelled && state.cancel.error?.uncertain ? null : state.cancel.error}
            />
            <CancelFeedback phase={state.cancel.phase} serverCancelled={serverCancelled} />
          </>
        ) : (
          <Banner tone="warning">{t.denied}</Banner>
        )}
        <WorkActions state={state} selected={selected} onClose={onClose} onChanged={onChanged} />
        {state.cancelAllowed ? (
          <p className="text-xs text-muted-foreground">{t.cancelHint}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelFeedback({
  phase,
  serverCancelled,
}: {
  phase: WorkState['cancel']['phase'];
  serverCancelled: boolean;
}) {
  const locale = useShell((shell) => shell.locale);
  const t = workMessages[locale];
  if (phase === 'done') return <Banner tone="success">{t.cancelled}</Banner>;
  if (phase === 'unconfirmed' && serverCancelled)
    return <Banner tone="info">{t.serverCancelled}</Banner>;
  return phase === 'unconfirmed' ? <Banner tone="warning">{t.uncertain}</Banner> : null;
}

function WorkActions({
  state,
  selected,
  onClose,
  onChanged,
}: {
  state: WorkState;
  selected: SelectedWork;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locale = useShell((shell) => shell.locale);
  const t = workMessages[locale];
  const router = useAppNavigation();
  const { cancel, details, publication } = state;
  async function cancelWork() {
    await cancel.run();
    details.resume();
    onChanged();
  }
  return (
    <DialogFooter className="flex-wrap">
      {state.upload && state.canRead ? (
        <Button
          variant="outline"
          onClick={() =>
            router.push(
              `/dashboard/resources?${new URLSearchParams({ collection: selected.value.collection, uploadId: selected.value.id })}`,
            )
          }
        >
          {t.resumeUpload}
        </Button>
      ) : null}
      {publication?.documentId ? (
        <Button
          variant="outline"
          onClick={() =>
            router.push(
              `/dashboard/collections/${selected.value.collection}/${publication.documentId}`,
            )
          }
        >
          {t.openDocument}
        </Button>
      ) : null}
      {state.cancelAllowed ? (
        <Button
          variant="destructive"
          busy={cancel.phase === 'pending'}
          disabled={cancel.phase !== 'idle'}
          onClick={() => {
            void cancelWork();
          }}
        >
          {state.upload ? t.cancelUpload : t.cancelSchedule}
        </Button>
      ) : null}
      <Button variant="outline" disabled={cancel.phase === 'pending'} onClick={onClose}>
        {t.close}
      </Button>
    </DialogFooter>
  );
}
