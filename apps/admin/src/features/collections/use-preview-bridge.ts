'use client';

import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { documentPreviewSchema } from '../../contracts/collaboration';
import type { DocumentPreview } from '../../contracts/collaboration';
import type { ContentEditorModel } from './use-content-editor';
import type { ApiFailure } from '../management-shared/read-all-pages';
import { useAccessControl } from '../access-control/provider';
import { contentEditorPolicy } from './policy';

interface BridgeInput {
  adminOrigin: string | null;
  configuration: DocumentPreview;
  model: ContentEditorModel;
  frame: RefObject<HTMLIFrameElement | null>;
}
interface Connection extends Omit<BridgeInput, 'adminOrigin'> {
  channel: string;
  fail: (failure: ApiFailure | null) => void;
  disconnect: () => void;
  report: (result: ApiResult<unknown>) => void;
}
async function sendUpdate(input: Connection, controller: AbortController) {
  const { configuration, model, frame, channel } = input;
  const { snapshot, value } = model.state;
  if (!snapshot?.document) return;
  const result = await requestApi({
    operation: 'documents.preview',
    params: { collection: snapshot.collection.key, id: snapshot.document.id },
    query: { locale: snapshot.editor.locale },
    response: documentPreviewSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  if (!result.ok) {
    input.fail(result);
    input.disconnect();
    input.report(result);
    return;
  }
  if (
    result.data.origin !== configuration.origin ||
    result.data.url !== configuration.url ||
    !result.data.live
  ) {
    input.disconnect();
    return;
  }
  input.fail(null);
  frame.current?.contentWindow?.postMessage(
    {
      type: 'cms-preview-update',
      channel,
      collection: snapshot.collection.key,
      id: snapshot.document.id,
      locale: snapshot.editor.locale,
      data: value,
    },
    configuration.origin,
  );
}
function usePreviewUpdates(input: BridgeInput, channel: string, ready: boolean) {
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [connected, setConnected] = useState(true);
  const { reportResult } = useAccessControl();
  const { configuration, model, frame } = input;
  const { snapshot } = model.state;
  useEffect(() => {
    if (!ready || !connected || !configuration.live || !snapshot?.document) return () => {};
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void sendUpdate(
        {
          configuration,
          model,
          frame,
          channel,
          fail: setFailure,
          disconnect: () => setConnected(false),
          report: reportResult,
        },
        controller,
      );
    }, contentEditorPolicy.previewUpdateDelayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, connected, channel, configuration, model, frame, snapshot, reportResult]);
  return { failure, connected };
}
function previewSandbox(previewOrigin: string, adminOrigin: string | null) {
  if (!adminOrigin || previewOrigin === adminOrigin) return null;
  return 'allow-scripts allow-same-origin';
}
function usePreviewHandshake(input: BridgeInput, channel: string) {
  const [ready, setReady] = useState(false);
  const { configuration, frame, model } = input;
  const { snapshot } = model.state;
  useEffect(() => {
    if (!configuration.live) return () => {};
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== configuration.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data === null ||
        typeof event.data !== 'object'
      )
        return;
      if (
        'type' in event.data &&
        'channel' in event.data &&
        event.data.type === 'cms-preview-ready' &&
        event.data.channel === channel
      )
        setReady(true);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [channel, configuration.origin, configuration.live, frame]);
  function connect() {
    setReady(false);
    if (!configuration.live || !snapshot?.document) return;
    frame.current?.contentWindow?.postMessage(
      {
        type: 'cms-preview-init',
        channel,
        collection: snapshot.collection.key,
        id: snapshot.document.id,
        locale: snapshot.editor.locale,
      },
      configuration.origin,
    );
  }
  return { ready, connect };
}
export function usePreviewBridge(input: BridgeInput) {
  const [channel] = useState(() => crypto.randomUUID());
  const handshake = usePreviewHandshake(input, channel);
  const update = usePreviewUpdates(input, channel, handshake.ready);
  return {
    ready: handshake.ready && update.connected,
    failure: update.failure,
    connect: handshake.connect,
    sandbox: previewSandbox(input.configuration.origin, input.adminOrigin),
  };
}
