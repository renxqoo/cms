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
import { readBulkEditor } from './bulk-read';
import { referenceServices } from './reference-services';
import type { ContentMessages } from './messages';
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
type BulkAction = z.infer<typeof actionSchema>;
const operations = {
  update: 'documents.update',
  copy: 'documents.copy',
  archive: 'documents.archive',
  restoreTrash: 'documents.restoreTrash',
} as const;

function useBulkModel(props: BulkProps) {
  const { collection, documents, locale } = props;
  const access = useAccessControl();
  const { reportResult } = access;
  const [action, setAction] = useState<BulkAction>(props.trashed ? 'restoreTrash' : 'archive');
  const [descriptor, setDescriptor] = useState<ApiResult<CollectionEditor> | null>(null);
  const [value, setValue] = useState<FieldData>({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [receipt, setReceipt] = useState<ReturnType<typeof batchResultSchema.parse> | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const mutation = useContentMutation();
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const services = useMemo(
    () => referenceServices(catalog.data?.rows ?? [], reportResult),
    [catalog.data, reportResult],
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
  const metadata = descriptor?.ok ? descriptor.data : null;
  const readError = descriptor && !descriptor.ok ? descriptor : null;
  const patch = metadata ? writablePatch(metadata.layout, {}, value) : {};
  const maximum =
    action === 'update'
      ? contentEditorPolicy.maximumBulkUpdates
      : contentEditorPolicy.maximumBulkItems;
  const canWrite = access.can(operations[action], {
    scopeKind: 'collection',
    collectionKey: collection.key,
  });
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
    metadata,
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
      if (parsed.success) {
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
    Object.keys(model.errors).length > 0 ||
    Object.keys(model.patch).length === 0;
  return base || (model.action === 'update' && updateInvalid);
}

function submitBulk(model: BulkModel) {
  const { action, props, patch } = model;
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
            error={mutation.error}
            {...(mutation.locked ? { onRetry: mutation.retry } : {})}
          />
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
          value={model.action}
          disabled={model.receipt !== null || mutation.locked}
          onChange={(event) => model.changeAction(event.currentTarget.value)}
        >
          {props.trashed ? (
            <option value="restoreTrash">{t.bulkRestore}</option>
          ) : (
            <>
              <option value="archive">{t.bulkArchive}</option>
              <option value="copy">{t.bulkCopy}</option>
              <option value="update">{t.bulkUpdate}</option>
            </>
          )}
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
          readOnly={model.receipt !== null}
        />
      ) : null}
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
