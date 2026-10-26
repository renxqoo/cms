'use client';
import { useCallback, useState } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { NativeSelect } from '@new-cms/ui/forms';
import type { Collection, Document } from '../../contracts/content';
import {
  collectionListSchema,
  contentBatchSchema,
  contentAcceptedSchema,
} from '../../contracts/content';
import { contentJobSchema } from '../../contracts/assets';
import type { CollectionEditor } from '../../contracts/editor';
import type { FieldData } from '../fields/types';
import { writablePatch } from '../fields/writable-data';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { collectionScope, contentPolicy } from './content-policy';
import { referenceServices } from './field-services';
import { useContentMutation } from './use-content-mutation';
import { BatchEditor, batchEditorLimit } from './batch-editor';
import { BatchJob } from './batch-job';
import type { ContentMessages } from './content-messages';
type BatchAction = 'archive' | 'restoreTrash' | 'copy' | 'update';
export function BatchDocuments({
  collection,
  documents,
  trashed,
  locale,
  onChanged,
  messages: t,
}: {
  collection: Collection;
  documents: readonly Document[];
  trashed: boolean;
  locale: string;
  onChanged: () => void;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<BatchAction>(trashed ? 'restoreTrash' : 'archive');
  const allowed = access.can('content.batch', collectionScope(collection.key));
  const permitted =
    access.can(`documents.${action}`, collectionScope(collection.key)) &&
    access.can('content.getJob', collectionScope(collection.key)) &&
    access.can('documents.list', collectionScope(collection.key));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-muted-foreground">
        {documents.length} {t.selected}
      </p>
      {allowed ? (
        <>
          <NativeSelect
            aria-label={t.action}
            value={action}
            onChange={(event) => {
              const next = event.target.value;
              if (
                next === 'archive' ||
                next === 'restoreTrash' ||
                next === 'copy' ||
                next === 'update'
              )
                setAction(next);
            }}
          >
            {(trashed ? (['restoreTrash'] as const) : (['archive', 'copy', 'update'] as const)).map(
              (value) => (
                <option key={value} value={value}>
                  {value === 'restoreTrash'
                    ? t.restore
                    : value === 'update'
                      ? t.batchUpdate
                      : t[value]}
                </option>
              ),
            )}
          </NativeSelect>
          <Button
            variant="outline"
            disabled={
              !permitted ||
              documents.length === 0 ||
              documents.length > contentPolicy.maximumBatchItems ||
              (action === 'update' && documents.length > batchEditorLimit)
            }
            onClick={() => setOpen(true)}
          >
            {t.batch}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t.batchUpdate} ≤ {batchEditorLimit}
          </span>
        </>
      ) : null}
      {open ? (
        <BatchDialog
          collection={collection}
          documents={documents}
          locale={locale}
          action={action}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
          messages={t}
        />
      ) : null}
    </div>
  );
}
function BatchDialog({
  collection,
  documents,
  locale,
  action,
  onClose,
  onChanged,
  messages: t,
}: {
  collection: Collection;
  documents: readonly Document[];
  locale: string;
  action: BatchAction;
  onClose: () => void;
  onChanged: () => void;
  messages: ContentMessages;
}) {
  const access = useAccessControl();
  const mutation = useContentMutation(access.reportResult);
  const [draft, setDraft] = useState<FieldData>({});
  const [invalid, setInvalid] = useState<Readonly<Record<string, string>>>({});
  const [editor, setEditor] = useState<CollectionEditor | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [terminal, setTerminal] = useState(false);
  const onReady = useCallback((value: CollectionEditor | null) => setEditor(value), []);
  const can = (operation: string) => access.can(operation, collectionScope(collection.key));
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const services = referenceServices(
    catalog.data?.rows ?? [],
    (key) => access.can('documents.list', collectionScope(key)),
    access.reportResult,
  );
  const patch = editor ? writablePatch(editor.layout, {}, draft) : {};
  const allowed = batchAllowed({ can, action, editor, patch, invalid });
  function accept(value: unknown) {
    const accepted = contentAcceptedSchema.safeParse(value);
    if (accepted.success) {
      setJobId(accepted.data.jobId);
      return;
    }
    const job = contentJobSchema.safeParse(value);
    if (job.success) {
      setJobId(job.data.id);
      setTerminal(!['queued', 'running'].includes(job.data.status));
      if (!['queued', 'running'].includes(job.data.status)) onChanged();
    }
  }
  async function submit(retry = false) {
    if (!allowed) return;
    const result = retry
      ? await mutation.retry(allowed)
      : await mutation.run({
          operation: 'content.batch',
          params: { collection: collection.key },
          body: {
            action,
            ...(['update', 'copy'].includes(action) ? { locale } : {}),
            items: documents.map((document) => ({
              id: document.id,
              revision: document.revision,
              ...(action === 'update' ? { data: patch } : {}),
            })),
          },
          response: contentBatchSchema,
          key: 'batch',
        });
    if (result?.ok) accept(result.data);
  }
  return (
    <ManagementDialog
      open
      onClose={onClose}
      title={t.batch}
      description={t.batchHint}
      onSubmit={() => void submit()}
      pending={mutation.phase === 'writing'}
      locked={mutation.phase === 'blocked' || Boolean(jobId && !terminal)}
      disabled={!allowed || jobId !== null}
      feedback={
        <>
          <ManagementFeedback error={mutation.error} />
          {mutation.phase === 'blocked' ? (
            <Button variant="outline" disabled={!allowed} onClick={() => void submit(true)}>
              {t.retryIntent}
            </Button>
          ) : null}
        </>
      }
    >
      <p className="text-sm">
        {documents.length} {t.selected}
      </p>
      {action === 'update' && !jobId ? (
        <BatchEditor
          collection={collection}
          documents={documents}
          locale={locale}
          value={draft}
          onChange={setDraft}
          onValidity={(id, error) =>
            setInvalid((current) => {
              if ((current[id] ?? null) === error) return current;
              return error
                ? { ...current, [id]: error }
                : Object.fromEntries(Object.entries(current).filter(([key]) => key !== id));
            })
          }
          services={services}
          onReady={onReady}
          messages={t}
        />
      ) : null}
      {jobId ? (
        <>
          <Banner>{t.jobAccepted}</Banner>
          <BatchJob
            collection={collection.key}
            jobId={jobId}
            onTerminal={() => {
              setTerminal(true);
              onChanged();
            }}
            messages={t}
          />
        </>
      ) : null}
    </ManagementDialog>
  );
}

function batchAllowed(input: {
  can: (operation: string) => boolean;
  action: BatchAction;
  editor: CollectionEditor | null;
  patch: FieldData;
  invalid: Readonly<Record<string, string>>;
}) {
  const { can, action, editor, patch, invalid } = input;
  return (
    can(`documents.${action}`) &&
    can('content.batch') &&
    can('documents.list') &&
    can('content.getJob') &&
    (action !== 'update' ||
      (editor !== null &&
        can('collections.editor') &&
        Object.keys(patch).length > 0 &&
        Object.keys(invalid).length === 0))
  );
}
