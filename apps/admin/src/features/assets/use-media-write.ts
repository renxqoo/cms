'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UploadSession } from '../../contracts/assets';
import { useAccessControl } from '../access-control/provider';
import type { ApiFailure } from '../management-shared/read-all-pages';
import type { DocumentMediaProps } from './document-media';
import { useReprocess } from './use-reprocess';
import { attachFile, verifyAttachment } from './attachment';
import type { AttachmentInput } from './attachment';

export function useMediaWrite(props: DocumentMediaProps) {
  const access = useAccessControl();
  const [replacing, setReplacing] = useState(false);
  const [image, setImage] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [uncertain, setUncertain] = useState<UploadSession | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const { localBusy, changeBusy, changed } = useMediaLifecycle(props);
  const reprocess = useReprocess({
    ...processingTarget(props),
    onChanged: changed,
    onBusyChange: changeBusy,
  });
  const writable = mediaWritable(props.editor);
  const externalBusy = props.busy === true && !localBusy;
  const attachment: AttachmentInput = {
    props,
    pending,
    setError,
    setUncertain,
    changed,
    release: () => {
      setReplacing(false);
      changeBusy(false);
    },
    externalBusy,
    writable,
    uncertain,
    reportResult: access.reportResult,
  };
  return {
    replacing,
    setReplacing,
    image,
    setImage,
    localBusy,
    error,
    uncertain,
    changeBusy,
    reprocess,
    writable,
    externalBusy,
    attach: (session: UploadSession) => attachFile(attachment, session),
    verifyAttachment: () => verifyAttachment(attachment),
  };
}

function useMediaLifecycle(props: DocumentMediaProps) {
  const [localBusy, setLocalBusy] = useState(false);
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  }, [props]);
  const changeBusy = useCallback((value: boolean) => {
    setLocalBusy(value);
    callbacks.current.onBusyChange?.(value);
  }, []);
  const changed = useCallback(async () => {
    await callbacks.current.onDocumentChanged();
  }, []);
  return { localBusy, changeBusy, changed };
}

function mediaWritable(editor: DocumentMediaProps['editor']) {
  return editor.actions.some(
    (action) => action.operationId === 'documents.update' && action.state !== 'denied',
  );
}

function processingTarget(props: DocumentMediaProps) {
  return {
    collection: props.collection.key,
    id: props.document?.id ?? '',
    revision: props.document?.revision ?? 1,
    locale: props.editor.locale,
    editorSessionId: props.editorSessionId,
  };
}
