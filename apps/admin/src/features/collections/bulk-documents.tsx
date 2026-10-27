'use client';

import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Field, NativeSelect } from '@new-cms/ui/forms';
import { collectionListSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import type { CollectionEditor } from '../../contracts/editor';
import { batchResultSchema, contentJobSchema } from '../../contracts/jobs';
import type { ApiResult } from '../../api/result';
import type { FieldData } from '../fields/types';
import { FieldRenderer } from '../fields/field-renderer';
import { writablePatch } from '../fields/writable-data';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { ManagementDialog } from '../management-shared/management-dialog';
import { ManagementFeedback } from '../management-shared/feedback';
import { useAppNavigation } from '../../components/shell/navigation/provider';
import { useCandidatePresentation } from './use-candidate-presentation';
import { readBulkEditor, bulkEditorLayout } from './bulk-read';
import { referenceServices } from './reference-services';
import type { ContentMessages } from './messages';
import { allowedBulkActions, bulkOperations } from './bulk-actions';
import type { BulkAction } from './bulk-actions';
import { contentEditorPolicy } from './policy';
import { useContentMutation } from './use-content-mutation';

interface BulkProps {
  collection: Collection;
  documents: readonly Document[];
  locale: string;
  trashed: boolean;
  t: ContentMessages;
  onClose: () => void;
  onCompleted: () => void;
}
const actionSchema = z.enum(['update', 'copy', 'archive', 'restoreTrash']);

function useBulkModel(props: BulkProps) {
  const { collection, documents, locale } = props;
  const access = useAccessControl();
  const { reportResult } = access;
  const actions = allowedBulkActions(collection, props.trashed).filter((action) =>
    access.can(bulkOperations[action], { scopeKind: 'collection', collectionKey: collection.key }),
  );
  const [chosenAction, setAction] = useState<BulkAction>(
    props.trashed ? 'restoreTrash' : 'archive',
  );
  const action = actions.includes(chosenAction) ? chosenAction : (actions[0] ?? null);
  const [descriptor, setDescriptor] = useState<ApiResult<CollectionEditor> | null>(null);
  const [value, setValue] = useState<FieldData>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [receipt, setReceipt] = useState<ReturnType<typeof batchResultSchema.parse> | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useContentMutation();
  const catalog = useApiQuery({
    operation: 'collections.list',
    query: { locale },
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const metadata = useMemo(
    () =>
      descriptor?.ok
        ? { ...descriptor.data, layout: bulkEditorLayout(descriptor.data.layout) }
        : null,
    [descriptor],
  );
  const snapshot = useMemo(
    () =>
      metadata && documents[0] ? { collection, editor: metadata, document: documents[0] } : null,
    [metadata, documents, collection],
  );
  const presentation = useCandidatePresentation({
    snapshot,
    data: value,
    documents,
    active: action === 'update' && receipt === null,
    report: reportResult,
  });
  const services = useMemo(
    () =>
      referenceServices(
        catalog.data?.rows ?? [],
        reportResult,
        metadata
          ? {
              collection: collection.key,
              documents,
              locale,
              data: writablePatch(metadata.layout, {}, value),
            }
          : undefined,
      ),
    [catalog.data, reportResult, metadata, collection.key, documents, locale, value],
  );
  useEffect(() => {
    if (action !== 'update' || receipt) return () => {};
    const controller = new AbortController();
    void readBulkEditor({ collection, documents, locale, signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) {
          setDescriptor(result);
          reportResult(result);
        }
        return result;
      },
    );
    return () => controller.abort();
  }, [action, collection, documents, locale, reportResult, receipt]);
  const readError = descriptor && !descriptor.ok ? descriptor : null;
  const patch = metadata ? writablePatch(metadata.layout, {}, value) : {};
  const maximum =
    action === 'update'
      ? contentEditorPolicy.maximumBulkUpdates
      : contentEditorPolicy.maximumBulkItems;
  const canWrite = action !== null;
  function validity(name: string, error: string | null) {
    setErrors((previous) =>
      error === null
        ? Object.fromEntries(Object.entries(previous).filter(([field]) => field !== name))
        : { ...previous, [name]: error },
    );
  }
  return {
    props,
    action,
    actions,
    metadata,
    presentation,
    readError,
    reading: action === 'update' && descriptor === null,
    value,
    setValue,
    errors,
    receipt,
    setReceipt,
    key,
    mutation,
    services,
    patch,
    maximum,
    canWrite,
    validity,
    changeAction: (next: string) => {
      const parsed = actionSchema.safeParse(next);
      if (parsed.success && actions.includes(parsed.data)) {
        setAction(parsed.data);
        setDescriptor(null);
      }
    },
  };
}

type BulkModel = ReturnType<typeof useBulkModel>;
function bulkDisabled(model: BulkModel) {
  const base =
    model.receipt !== null ||
    model.mutation.locked ||
    !model.canWrite ||
    model.props.documents.length === 0 ||
    model.props.documents.length > model.maximum;
  const updateInvalid =
    !model.metadata ||
    model.presentation.previewBusy ||
    model.presentation.previewFailure !== null ||
    Object.keys(model.errors).length > 0 ||
    Object.keys(model.patch).length === 0;
  return base || (model.action === 'update' && updateInvalid);
}

function submitBulk(model: BulkModel) {
  const { action, props, patch } = model;
  if (action === null || bulkDisabled(model)) return;
  void model.mutation.run(
    {
      operation: 'content.batch',
      params: { collection: props.collection.key },
      body: {
        action,
        ...(action === 'update' || action === 'copy' ? { locale: props.locale } : {}),
        items: props.documents.map((document) => ({
          id: document.id,
          revision: document.revision,
          ...(action === 'update' ? { data: patch } : {}),
        })),
      },
      response: batchResultSchema,
      idempotencyKey: model.key,
    },
    (data) => {
      model.setReceipt(data);
      props.onCompleted();
    },
  );
}

export function BulkDocuments(props: BulkProps) {
  const model = useBulkModel(props);
  const { t } = props;
  const { mutation, metadata } = model;
  return (
    <ManagementDialog
      open
      onClose={props.onClose}
      title={t.bulk}
      description={t.bulkWarning}
      pending={mutation.pending || model.reading}
      locked={mutation.locked}
      dirty={
        model.receipt === null &&
        (Object.keys(model.value).length > 0 || Object.keys(model.errors).length > 0)
      }
      disabled={bulkDisabled(model)}
      submitLabel={t.confirm}
      onSubmit={() => submitBulk(model)}
      feedback={
        <>
          <ManagementFeedback error={model.readError} />
          <ManagementFeedback
            error={model.presentation.previewFailure}
            onRetry={model.presentation.retry}
          />
          <ManagementFeedback
            error={mutation.error}
            {...(mutation.locked ? { onRetry: mutation.retry } : {})}
          />
          {model.action === null ? <Banner tone="warning">{t.operationsDisabled}</Banner> : null}
          {props.documents.length > model.maximum ? (
            <Banner tone="warning">{t.bulkLimit}</Banner>
          ) : null}
        </>
      }
    >
      <p>
        {t.selected}: {props.documents.length}
      </p>
      <Field id="bulk-action" label={t.bulk}>
        <NativeSelect
          value={model.action ?? ''}
          disabled={model.receipt !== null || mutation.locked}
          onChange={(event) => model.changeAction(event.currentTarget.value)}
        >
          {model.actions.map((action) => (
            <option key={action} value={action}>
              {
                {
                  archive: t.bulkArchive,
                  copy: t.bulkCopy,
                  update: t.bulkUpdate,
                  restoreTrash: t.bulkRestore,
                }[action]
              }
            </option>
          ))}
        </NativeSelect>
      </Field>
      {model.action === 'update' && metadata ? (
        <FieldRenderer
          idPrefix="bulk-fields"
          layout={metadata.layout}
          value={model.value}
          onChange={model.setValue}
          onValidityChange={model.validity}
          resetKey={`bulk:${metadata.behaviorHash}`}
          locale={props.locale}
          services={model.services}
          richTextNodes={metadata.richTextNodes}
          visibility={model.presentation.visibility}
          componentProps={model.presentation.componentProps}
          choiceOptions={model.presentation.choiceOptions}
          readOnly={model.receipt !== null}
        />
      ) : null}
      {model.presentation.previewBusy ? <p role="status">{t.loading}</p> : null}
      {model.readError ? <p>{t.bulkIncompatible}</p> : null}
      {model.receipt ? (
        <BulkReceipt receipt={model.receipt} collection={props.collection.key} t={t} />
      ) : null}
    </ManagementDialog>
  );
}

function BulkReceipt({
  receipt,
  collection,
  t,
}: {
  receipt: ReturnType<typeof batchResultSchema.parse>;
  collection: string;
  t: ContentMessages;
}) {
  const result = contentJobSchema.safeParse(receipt);
  const navigation = useAppNavigation();
  return (
    <div className="space-y-3">
      <p>{t.received}</p>
      {result.success ? (
        <div className="space-y-2">
          <p>
            {result.data.status} · {result.data.succeeded}/{result.data.total}
          </p>
          <pre className="max-h-72 overflow-auto text-xs">
            {JSON.stringify(result.data.items, null, 2)}
          </pre>
        </div>
      ) : null}
      <Button
        variant="outline"
        onClick={() =>
          navigation.push(
            `/dashboard/jobs?collection=${encodeURIComponent(collection)}&jobId=${'jobId' in receipt ? receipt.jobId : receipt.id}`,
          )
        }
      >
        {t.jobs}
      </Button>
    </div>
  );
}
