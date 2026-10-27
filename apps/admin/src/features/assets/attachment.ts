import type { RefObject } from 'react';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { documentSchema } from '../../contracts/documents';
import { uploadSessionSchema } from '../../contracts/assets';
import type { UploadSession } from '../../contracts/assets';
import type { ApiFailure } from '../management-shared/read-all-pages';
import type { DocumentMediaProps } from './document-media';

export interface AttachmentInput {
  props: DocumentMediaProps;
  pending: RefObject<AbortController | null>;
  setError: (value: ApiFailure | null) => void;
  setUncertain: (value: UploadSession | null) => void;
  changed: () => Promise<void>;
  release: () => void;
  externalBusy: boolean;
  writable: boolean;
  uncertain: UploadSession | null;
  reportResult: (result: ApiResult<unknown>) => void;
}
export async function attachFile(input: AttachmentInput, session: UploadSession) {
  const { document, collection } = input.props;
  const {
    pending,
    setError,
    setUncertain,
    changed,
    release,
    externalBusy,
    writable,
    reportResult,
  } = input;
  if (!document || externalBusy || !writable || pending.current) return;
  const controller = new AbortController();
  pending.current = controller;
  setError(null);
  const result = await requestApi({
    operation: 'documents.update',
    ...(input.props.editorSessionId ? { editorSessionId: input.props.editorSessionId } : {}),
    params: { collection: collection.key, id: document.id },
    body: { revision: document.revision, uploadId: session.id, locale: input.props.editor.locale },
    response: documentSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  pending.current = null;
  if (result.ok) {
    await changed();
    setUncertain(null);
    release();
  } else {
    reportResult(result);
    setError(result);
    if (result.uncertain) setUncertain(session);
  }
}
export async function verifyAttachment(input: AttachmentInput) {
  const { document, editor, collection } = input.props;
  const { pending, setError, setUncertain, changed, release, uncertain, reportResult } = input;
  if (!document || !uncertain || pending.current) return;
  const controller = new AbortController();
  pending.current = controller;
  const upload = await requestApi({
    operation: 'assets.readUpload',
    params: { collection: collection.key, uploadId: uncertain.id },
    response: uploadSessionSchema,
    signal: controller.signal,
  });
  const fresh = await requestApi({
    operation: 'documents.get',
    params: { collection: collection.key, id: document.id },
    query: { locale: editor.locale, fallback: [], depth: 0, mode: editor.mode },
    response: documentSchema,
    signal: controller.signal,
  });
  if (controller.signal.aborted) return;
  pending.current = null;
  if (!upload.ok) {
    setError(upload);
    reportResult(upload);
    return;
  }
  if (!fresh.ok) {
    setError(fresh);
    reportResult(fresh);
    return;
  }
  const consumed =
    upload.data.status === 'consumed' && fresh.data.file?.id === upload.data.manifest?.id;
  if (consumed) {
    await changed();
    setUncertain(null);
    setError(null);
    release();
  } else if (upload.data.status === 'ready' && fresh.data.revision === document.revision) {
    setUncertain(null);
    setError(null);
  }
}
