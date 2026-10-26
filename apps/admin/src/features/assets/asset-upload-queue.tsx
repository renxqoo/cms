'use client';

import { useEffect, useEffectEvent, useLayoutEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Banner } from '@new-cms/ui/feedback';
import { Dropzone } from '../../components/cms/dropzone';
import { useShell } from '../../components/shell/shell-provider';
import { useAccessControl } from '../access-control/provider';
import { browserVisibility } from '../jobs/visibility';
import { assetWorkPolicy } from '../jobs/policy';
import { createUploadQueue } from './upload-queue';
import { UploadQueueView, uploadActive } from './upload-queue-view';
import type { AssetUploadQueueProps } from './asset-upload-types';
import type { UploadOperation } from './upload-permissions';
import { assetMessages } from './messages';

function QueueScope(props: AssetUploadQueueProps) {
  const access = useAccessControl();
  const t = assetMessages[useShell((state) => state.locale)];
  const ready = useEffectEvent(
    (session: Parameters<NonNullable<AssetUploadQueueProps['onReady']>>[0]) =>
      props.onReady?.(session),
  );
  const terminal = useEffectEvent(
    (session: Parameters<NonNullable<AssetUploadQueueProps['onTerminal']>>[0]) =>
      props.onTerminal?.(session),
  );
  const activity = useEffectEvent((active: boolean) => props.onActivityChange?.(active));
  const [authorization] = useState(() => createStore(() => ({ access, disabled: props.disabled })));
  function can(operation: UploadOperation) {
    const current = authorization.getState();
    const scope = { scopeKind: 'collection' as const, collectionKey: props.collection };
    return (
      current.access.phase === 'ready' &&
      current.access.can(operation, scope) &&
      (operation === 'assets.readUpload' ||
        (!current.disabled && current.access.can('documents.create', scope)))
    );
  }
  const [controller] = useState(() =>
    createUploadQueue({
      collection: props.collection,
      budget: props.budget,
      purpose: 'create',
      can,
      concurrency: assetWorkPolicy.uploadConcurrency,
      onResult: access.reportResult,
      visibility: browserVisibility,
    }),
  );
  const state = useStore(controller.store);
  const allowed =
    access.phase === 'ready' &&
    [
      'documents.create',
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.cancelUpload',
    ].every((operation) =>
      access.can(operation, { scopeKind: 'collection', collectionKey: props.collection }),
    );
  useLayoutEffect(() => {
    authorization.setState({ access, disabled: props.disabled });
    controller.reconcile();
  }, [access, props.disabled, controller, authorization]);
  useEffect(() => {
    controller.start();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    let before = controller.store.getState();
    activity(before.items.some((item) => uploadActive(item) && item.stage !== 'ready'));
    const stop = controller.store.subscribe((next) => {
      for (const item of next.items) {
        const previous = before.items.find((entry) => entry.id === item.id);
        if (item.session && previous?.stage !== item.stage) {
          if (item.stage === 'ready') ready(item.session);
          else if (['consumed', 'failed', 'cancelled'].includes(item.stage)) terminal(item.session);
        }
      }
      activity(next.items.some((item) => uploadActive(item) && item.stage !== 'ready'));
      before = next;
    });
    return () => {
      stop();
      activity(false);
    };
  }, [controller]);
  return (
    <div className="space-y-4">
      {!allowed ? <Banner tone="warning">{t.denied}</Banner> : null}
      <Dropzone
        limits={{
          maxFiles: Math.max(0, assetWorkPolicy.uploadQueueLimit - state.items.length),
          maxBytes: props.budget.maxBytes,
          accept: props.budget.mimeTypes,
        }}
        labels={{
          label: t.upload,
          description: t.drop,
          choose: t.choose,
          count: t.count,
          size: t.size,
          type: t.type,
        }}
        disabled={
          !allowed ||
          props.disabled === true ||
          state.items.length >= assetWorkPolicy.uploadQueueLimit
        }
        onFiles={controller.add}
        onReject={() => {}}
      />
      <UploadQueueView
        items={state.items}
        controller={controller}
        collection={props.collection}
        linkReady={!props.onReady}
        readOnly={!allowed || props.disabled === true}
      />
    </div>
  );
}

export function AssetUploadQueue(props: AssetUploadQueueProps) {
  return <QueueScope key={JSON.stringify([props.collection, props.budget])} {...props} />;
}

export type { AssetUploadQueueProps } from './asset-upload-types';
