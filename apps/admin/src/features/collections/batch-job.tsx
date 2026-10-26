'use client';
import { useEffect, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionScope } from './content-policy';
import { createJobWatcher } from './job-watcher';
import type { JobWatchState } from './job-watcher';
import type { ContentMessages } from './content-messages';
export function BatchJob({
  collection,
  jobId,
  onTerminal,
  messages: t,
}: {
  collection: string;
  jobId: string;
  onTerminal: () => void;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const [state, setState] = useState<JobWatchState>({
    data: null,
    error: null,
    busy: false,
    paused: false,
  });
  const [watcher] = useState(() =>
    createJobWatcher({
      collection,
      jobId,
      changed: setState,
      report: access.reportResult,
      terminal: onTerminal,
    }),
  );
  const allowed = access.can('content.getJob', collectionScope(collection));
  useEffect(() => {
    function visibility() {
      watcher.visibility(allowed && !document.hidden);
    }
    watcher.visibility(allowed && !document.hidden);
    watcher.start();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      watcher.dispose();
    };
  }, [watcher, allowed]);
  return (
    <div className="space-y-3">
      <p className="break-all text-xs">{jobId}</p>
      <ManagementFeedback error={state.error} />
      <p role="status" className="text-sm">
        {state.data?.status ?? t.waiting}
      </p>
      {state.data ? (
        <ul className="space-y-1 text-xs">
          {state.data.items.map((item) => (
            <li key={item.position} className="break-all">
              {item.id} · {item.status} {item.error?.code ?? ''}
            </li>
          ))}
        </ul>
      ) : null}
      {state.paused ? <Banner>{t.pause}</Banner> : null}
      <Button
        variant="outline"
        disabled={state.busy || !allowed}
        onClick={() => watcher.continue()}
      >
        {t.continueChecking}
      </Button>
    </div>
  );
}
