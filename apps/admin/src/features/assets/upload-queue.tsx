'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@new-cms/ui/actions';
import { Banner } from '@new-cms/ui/feedback';
import { Dropzone } from '../../components/cms/dropzone';
import { useShell } from '../../components/shell/shell-provider';
import { requestApi } from '../../api/client';
import { uploadSessionSchema } from '../../contracts/assets';
import type { CollectionEditor } from '../../contracts/editor';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { createUploadController } from './upload-controller';
import type { QueuedUpload, UploadQueueOptions } from './upload-controller';
import { assetMessages } from './asset-messages';
import { assetUiPolicy } from './policy';

interface UploadQueueProps {
  collection: string;
  limits: NonNullable<CollectionEditor['upload']>;
  purpose: 'create' | 'replace';
  documentId?: string;
  revision?: number;
  initialUploadId?: string;
  disabled?: boolean;
  single?: boolean;
  onReady: (session: NonNullable<QueuedUpload['session']>) => void;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}

function uploadBusy(items: readonly QueuedUpload[]) {
  return items.some((item) =>
    ['queued', 'uploading', 'processing', 'ready', 'paused'].includes(item.status),
  );
}

export function UploadQueue(props: UploadQueueProps) {
  const { can, reportResult } = useAccessControl();
  const locale = useShell((state) => state.locale);
  const t = assetMessages[locale];
  const [controller] = useState(() =>
    createUploadController({
      collection: props.collection,
      purpose: props.purpose,
      ...(props.documentId ? { documentId: props.documentId } : {}),
      ...(props.revision ? { revision: props.revision } : {}),
      onResult: reportResult,
    } satisfies UploadQueueOptions),
  );
  const items = useStore(controller.store, (state) => state.items);
  const busy =
    props.purpose === 'replace'
      ? uploadBusy(items)
      : items.some((item) => ['queued', 'uploading', 'processing', 'paused'].includes(item.status));
  const scope = { scopeKind: 'collection' as const, collectionKey: props.collection };
  const allowed = [
    'assets.createUpload',
    'assets.writeUpload',
    'assets.completeUpload',
    'assets.readUpload',
    'assets.cancelUpload',
    props.purpose === 'replace' ? 'documents.update' : 'documents.create',
    'documents.get',
    'collections.get',
    'collections.editor',
  ].every((operation) => can(operation, scope));
  useEffect(() => {
    controller.activate();
    const observe = () => controller.setVisible(document.visibilityState !== 'hidden');
    observe();
    document.addEventListener('visibilitychange', observe);
    return () => {
      document.removeEventListener('visibilitychange', observe);
      controller.dispose();
    };
  }, [controller]);
  useRestoreUpload(props, controller);
  const { onBusyChange } = props;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const active = items.filter(
    (item) => !['failed', 'cancelled', 'expired', 'consumed'].includes(item.status),
  ).length;
  return (
    <section className="space-y-4" aria-label={props.purpose === 'replace' ? t.replace : t.upload}>
      {!allowed ? <Banner tone="warning">{t.dependencies}</Banner> : null}
      <Dropzone
        limits={{
          accept: props.limits.mimeTypes,
          maxBytes: props.limits.maxBytes,
          maxFiles: props.single
            ? Math.max(0, 1 - active)
            : Math.max(0, assetUiPolicy.queueSize - items.length),
        }}
        labels={{
          label: props.purpose === 'replace' ? t.replace : t.upload,
          description: t.drop,
          choose: t.choose,
          count: t.count,
          size: t.size,
          type: t.type,
        }}
        disabled={!allowed || (props.disabled ?? false) || (props.single === true && active > 0)}
        onFiles={controller.enqueue}
        onReject={() => {}}
      />
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 rounded-xl border p-4">
            <p className="break-all font-medium">{item.name}</p>
            <p role="status" className="text-sm text-muted-foreground">
              {uploadLabel(item, t)}
            </p>
            {item.status === 'uploading' ? (
              <progress
                aria-label={`${t.uploading} ${item.name}`}
                value={item.progress}
                max={100}
                className="h-2 w-full accent-primary"
              />
            ) : null}
            <ManagementFeedback error={item.error} />
            <div className="flex flex-wrap gap-2">
              {item.session && !['cancelled', 'expired', 'consumed'].includes(item.status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void controller.cancel(item.id);
                  }}
                >
                  {t.cancel}
                </Button>
              ) : null}
              {item.status === 'queued' || (!item.session && item.status === 'uploading') ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void controller.cancel(item.id);
                  }}
                >
                  {t.cancel}
                </Button>
              ) : null}
              {item.status === 'paused' ? (
                <Button variant="outline" size="sm" onClick={() => controller.verify(item.id)}>
                  {t.resume}
                </Button>
              ) : null}
              {item.file && ['failed', 'cancelled', 'expired'].includes(item.status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!allowed || props.disabled}
                  onClick={() => controller.retry(item.id)}
                >
                  {t.retry}
                </Button>
              ) : null}
              {item.status === 'ready' && item.session ? (
                <Button
                  disabled={props.disabled}
                  onClick={() => {
                    if (item.session) props.onReady(item.session);
                  }}
                >
                  {t.attach}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function uploadLabel(item: QueuedUpload, t: (typeof assetMessages)['en' | 'zh']) {
  switch (item.status) {
    case 'queued':
      return t.pending;
    case 'uploading':
      return t.uploading;
    case 'processing':
      return t.processing;
    case 'ready':
      return t.ready;
    case 'consumed':
      return t.consumed;
    case 'failed':
      return item.session?.failureCode ? `${t.error}: ${item.session.failureCode}` : t.error;
    case 'cancelled':
      return t.cancelled;
    case 'expired':
      return t.expired;
    case 'paused':
      return t.paused;
  }
  return t.error;
}

function useRestoreUpload(
  props: UploadQueueProps,
  controller: ReturnType<typeof createUploadController>,
) {
  const { can, reportResult, phase } = useAccessControl();
  const scope = { scopeKind: 'collection' as const, collectionKey: props.collection };
  const { initialUploadId, collection, purpose, documentId, revision } = props;
  const canRestore = can('assets.readUpload', scope);
  useEffect(() => {
    if (!initialUploadId || !canRestore || phase !== 'ready') return () => {};
    const abort = new AbortController();
    void requestApi({
      operation: 'assets.readUpload',
      params: { collection, uploadId: initialUploadId },
      response: uploadSessionSchema,
      signal: abort.signal,
    }).then((result) => {
      if (!abort.signal.aborted) {
        if (
          result.ok &&
          result.data.purpose === purpose &&
          (purpose !== 'replace' ||
            (result.data.documentId === documentId && result.data.revision === revision))
        )
          controller.recover(result.data);
        else if (!result.ok) reportResult(result);
      }
      return result;
    });
    return () => abort.abort();
  }, [
    initialUploadId,
    collection,
    purpose,
    documentId,
    revision,
    controller,
    phase,
    canRestore,
    reportResult,
  ]);
}
