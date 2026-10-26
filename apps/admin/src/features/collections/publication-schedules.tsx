'use client';
import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, Input } from '@new-cms/ui/forms';
import { Card, CardContent, CardHeader, CardTitle } from '@new-cms/ui/layout';
import { jobSummaryPageSchema } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionScope } from './content-policy';
import { documentDirty } from './channel-data';
import { useRevisionRefresh } from './use-revision-refresh';
import type { DocumentChannel, DocumentChannelState } from './channel-types';
import type { ContentMessages } from './content-messages';
export function PublicationSchedules({
  channel,
  state,
  messages: t,
}: {
  channel: DocumentChannel;
  state: DocumentChannelState;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const doc = state.snapshot.document;
  const collection = state.snapshot.collection.key;
  const can = (operation: string) => access.can(operation, collectionScope(collection));
  const [page, setPage] = useState(1);
  const [date, setDate] = useState('');
  const [dateError, setDateError] = useState(false);
  const jobs = useApiQuery({
    operation: 'content.listJobs',
    params: { collection },
    query: { action: 'publication', documentId: doc?.id, page, pageSize: 20 },
    response: jobSummaryPageSchema,
    enabled: Boolean(doc) && can('content.listJobs'),
  });
  useRevisionRefresh(`${doc?.revision ?? ''}:${state.completion}`, jobs.reload);
  const allowed = scheduleReady(state, jobs.phase) && can('content.getJob');
  function schedule() {
    const parsed = new Date(date);
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      setDateError(true);
      return;
    }
    if (allowed && doc)
      void channel.execute({
        kind: 'schedule',
        versionId: doc.versionId,
        executeAt: parsed.toISOString(),
      });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.schedules}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t.scheduleHint}</p>
        <ManagementFeedback error={jobs.error} onRetry={jobs.reload} />
        {can('content.schedulePublication') ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field
              id="publication-date"
              label={t.executeAt}
              error={dateError ? t.dateInvalid : undefined}
            >
              <Input
                type="datetime-local"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setDateError(false);
                }}
              />
            </Field>
            <Button variant="outline" disabled={!allowed} onClick={schedule}>
              {t.schedule}
            </Button>
          </div>
        ) : null}
        <Button variant="outline" onClick={jobs.reload}>
          {t.refresh}
        </Button>
        {jobs.data?.rows.length === 0 ? <Banner>{t.noSchedules}</Banner> : null}
        <ul className="space-y-3">
          {jobs.data?.rows.map((job) => (
            <li key={job.id} className="space-y-2 rounded-lg border p-3 text-xs">
              <p className="break-all">
                {job.id} · {job.status}
              </p>
              {job.kind === 'content' ? (
                <>
                  <p>
                    {job.executeAt} · {job.requestedVersionId}
                  </p>
                  {can('content.cancelPublicationSchedule') &&
                  ['queued', 'running'].includes(job.status) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!allowed}
                      onClick={() =>
                        void channel.execute({ kind: 'cancelSchedule', scheduleId: job.id })
                      }
                    >
                      {t.cancelSchedule}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            {t.previous}
          </Button>
          <Button
            variant="outline"
            disabled={!jobs.data || page * 20 >= jobs.data.total}
            onClick={() => setPage((value) => value + 1)}
          >
            {t.next}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function scheduleReady(state: DocumentChannelState, phase: string) {
  return (
    state.snapshot.document !== null &&
    state.phase === 'idle' &&
    !documentDirty(state) &&
    Object.keys(state.invalid).length === 0 &&
    phase === 'ready'
  );
}
