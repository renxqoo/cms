'use client';

import { useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { jobAcceptedSchema } from '../../contracts/jobs';
import type { Document } from '../../contracts/documents';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { useContentMutation } from './use-content-mutation';
import type { ContentMessages } from './messages';

export function PublicationSchedule({
  document,
  locale,
  canPublish = true,
  canUnpublish = true,
  t,
  onClose,
  onBusyChange,
}: {
  document: Document;
  locale?: string;
  canPublish?: boolean;
  canUnpublish?: boolean;
  t: ContentMessages;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [time, setTime] = useState('');
  const [action, setAction] = useState<'publish' | 'unpublish'>(canPublish ? 'publish' : 'unpublish');
  const [valid, setValid] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const [jobId, setJobId] = useState<string | null>(null);
  const mutation = useContentMutation();
  const navigation = useAppNavigation();
  const timestamp = Date.parse(time);
  return (
    <ManagementDialog
      open
      onClose={() => {
        onBusyChange(false);
        onClose();
      }}
      title={t.schedule}
      description={t.utc}
      submitLabel={t.schedule}
      dirty={jobId === null && time.length > 0}
      pending={mutation.pending}
      locked={mutation.locked}
      disabled={jobId !== null || !valid || mutation.locked || (action === 'unpublish' && !document.publishedVersionId)}
      feedback={
        <ManagementFeedback
          error={mutation.error}
          {...(mutation.locked ? { onRetry: mutation.retry } : {})}
        />
      }
      onSubmit={() => {
        if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
          setValid(false);
          return;
        }
        onBusyChange(true);
        void mutation
          .run(
            {
              operation: 'content.schedulePublication',
              params: { collection: document.collection, id: document.id },
              body: {
                revision: document.revision,
                versionId: action === 'unpublish' ? document.publishedVersionId : document.versionId,
                action,
                ...(locale ? { locale } : {}),
                executeAt: new Date(timestamp).toISOString(),
              },
              response: jobAcceptedSchema,
              idempotencyKey: key,
            },
            (receipt) => {
              onBusyChange(false);
              setJobId(receipt.jobId);
            },
          )
          .then((result) => {
            if (result && !result.ok && !result.uncertain) onBusyChange(false);
            return result;
          });
      }}
    >
      <Field id="publication-action" label={t.scheduleAction}>
        <NativeSelect
          value={action}
          disabled={mutation.pending || mutation.locked || jobId !== null}
          onChange={(event) => setAction(event.currentTarget.value === 'unpublish' ? 'unpublish' : 'publish')}
        >
          <option value="publish" disabled={!canPublish}>{t.publish}</option>
          <option value="unpublish" disabled={!canUnpublish || !document.publishedVersionId}>{t.unpublish}</option>
        </NativeSelect>
      </Field>
      <Field id="publication-time" label={t.executeAt}>
        <Input
          type="datetime-local"
          disabled={mutation.pending || mutation.locked || jobId !== null}
          value={time}
          onChange={(event) => {
            const { value } = event.currentTarget;
            setTime(value);
            setValid(Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now());
          }}
        />
      </Field>
      {jobId ? (
        <div className="space-y-3">
          <p role="status">{t.scheduled}</p>
          <Button
            variant="outline"
            onClick={() =>
              navigation.push(
                `/dashboard/jobs?collection=${encodeURIComponent(document.collection)}&jobId=${jobId}`,
              )
            }
          >
            {t.jobs}
          </Button>
        </div>
      ) : null}
      {mutation.locked ? (
        <Button
          variant="outline"
          onClick={() => {
            onBusyChange(true);
            mutation.retry();
          }}
        >
          {t.retryIntent}
        </Button>
      ) : null}
    </ManagementDialog>
  );
}
