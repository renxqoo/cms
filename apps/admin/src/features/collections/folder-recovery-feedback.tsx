'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { ManagementFeedback } from '../management-shared/feedback';
import type { useFolderRecovery } from './use-folder-recovery';
import type { ContentMessages } from './content-messages';
interface FeedbackProps {
  flow: ReturnType<typeof useFolderRecovery>;
  allowed: boolean;
  readAllowed: boolean;
  create: boolean;
  version: number | null;
  onAdopt: (version: number) => void;
  onCompleted: () => void;
  onLeave: () => void;
  messages: ContentMessages;
}
export function FolderRecoveryFeedback(props: FeedbackProps) {
  const { flow, allowed, readAllowed, create, onCompleted, onLeave, messages: t } = props;
  const [leaving, setLeaving] = useState(false);
  const { mutation, recovery } = flow;
  const blocked = mutation.phase === 'blocked';
  const conflict = mutation.error?.error.code === 'version_conflict';
  async function check() {
    if (!readAllowed) return;
    if (await flow.verify()) onCompleted();
  }
  async function retry() {
    if (!allowed) return;
    const result = await mutation.retry(allowed);
    if (result?.ok) onCompleted();
  }
  return (
    <div className="space-y-3">
      <ManagementFeedback error={mutation.error} />
      <ManagementFeedback error={recovery.error} />
      {blocked ? (
        <Banner tone="warning">{create ? t.verifyCreate : t.folderVerifyHint}</Banner>
      ) : null}
      {conflict ? (
        <Button
          variant="outline"
          busy={recovery.phase === 'reading'}
          disabled={!readAllowed}
          onClick={() => void check()}
        >
          {t.refresh}
        </Button>
      ) : null}
      {blocked ? (
        <Button
          variant="outline"
          busy={recovery.phase === 'reading'}
          disabled={create ? !allowed : !readAllowed}
          onClick={() => void (create ? retry() : check())}
        >
          {t.retryIntent}
        </Button>
      ) : null}
      <FolderObservation {...props} />
      {blocked ? (
        <div className="space-y-2">
          <Button variant="outline" onClick={() => setLeaving(true)}>
            {t.folderLeave}
          </Button>
          {leaving ? (
            <Banner tone="warning" className="space-y-3">
              <p>{t.folderLeaveHint}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setLeaving(false)}>
                  {t.stay}
                </Button>
                <Button variant="destructive" onClick={onLeave}>
                  {t.confirm}
                </Button>
              </div>
            </Banner>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FolderObservation({
  flow,
  allowed,
  readAllowed,
  create,
  version,
  onAdopt,
  messages: t,
}: FeedbackProps) {
  const { recovery } = flow;
  return (
    <>
      {' '}
      {recovery.phase === 'ready' ? (
        <div className="space-y-2">
          <Banner tone="warning">{t.folderUnconfirmed}</Banner>
          {recovery.row ? (
            <p className="text-sm break-all">
              {recovery.row.name} · {t.revision}: {recovery.row.version} · {t.parent}:{' '}
              {recovery.row.parentId ?? t.rootFolder}
            </p>
          ) : (
            <p className="text-sm">{t.folderAbsent}</p>
          )}
          {recovery.row && recovery.row.version > (version ?? 0) && !create ? (
            <Button
              variant="outline"
              disabled={!allowed || !readAllowed}
              onClick={() => {
                if (recovery.row) onAdopt(recovery.row.version);
              }}
            >
              {t.rebase}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
