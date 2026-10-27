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
  const [{ time, checkedAt }, setTime] = useState({ time: '', checkedAt: 0 });
  const [action, setAction] = useState<'publish' | 'unpublish'>(
    canPublish ? 'publish' : 'unpublish',
  );
  const [key] = useState(() => crypto.randomUUID());
  const [jobId, setJobId] = useState<string | null>(null);
  const mutation = useContentMutation();
  const navigation = useAppNavigation();
  const timestamp = Date.parse(time);
  const valid = Number.isFinite(timestamp) && timestamp > checkedAt;
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
      disabled={
        jobId !== null ||
        !valid ||
        mutation.locked ||
        (action === 'unpublish' && !document.publishedVersionId)
      }
      feedback={
        <ManagementFeedback
          error={mutation.error}
          {...(mutation.locked ? { onRetry: mutation.retry } : {})}
        />
      }
      onSubmit={() => {
        if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
          setTime({ time, checkedAt: Date.now() });
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
                versionId:
                  action === 'unpublish' ? document.publishedVersionId : document.versionId,
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
      <ScheduleFields
        {...{ action, setAction, time, canPublish, canUnpublish, document, t }}
        setTime={(value) => setTime({ time: value, checkedAt: Date.now() })}
        disabled={mutation.pending || mutation.locked || jobId !== null}
      />
      {jobId ? (
        <div className="space-y-3">
          <p role="status">{t.scheduled}</p>
          <Button
            variant="outline"
            onClick={() =>
              navigation.push(
                `/dashboard/jobs?${new URLSearchParams({ collection: document.collection, jobId, ...(locale ? { locale } : {}) })}`,
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

function ScheduleFields({
  action,
  setAction,
  time,
  setTime,
  canPublish,
  canUnpublish,
  document,
  t,
  disabled,
}: {
  action: 'publish' | 'unpublish';
  setAction: (value: 'publish' | 'unpublish') => void;
  time: string;
  setTime: (value: string) => void;
  canPublish: boolean;
  canUnpublish: boolean;
  document: Document;
  t: ContentMessages;
  disabled: boolean;
}) {
  return (
    <>
      <Field id="publication-action" label={t.scheduleAction}>
        <NativeSelect
          value={action}
          disabled={disabled}
          onChange={(event) =>
            setAction(event.currentTarget.value === 'unpublish' ? 'unpublish' : 'publish')
          }
        >
          <option value="publish" disabled={!canPublish}>
            {t.publish}
          </option>
          <option value="unpublish" disabled={!canUnpublish || !document.publishedVersionId}>
            {t.unpublish}
          </option>
        </NativeSelect>
      </Field>
      <Field id="publication-time" label={t.executeAt}>
        <Input
          type="datetime-local"
          disabled={disabled}
          value={time}
          onChange={(event) => {
            const { value } = event.currentTarget;
            setTime(value);
          }}
        />
      </Field>
    </>
  );
}
