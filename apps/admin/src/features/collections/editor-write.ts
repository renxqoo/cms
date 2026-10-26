import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { documentSchema } from '../../contracts/documents';
import type { Document } from '../../contracts/documents';
import { getOperation } from '../../contracts/operations';
import type { EditorWrite } from './editor-controller';
import { verifyWriteContext } from './write-context';
import { writeOperation } from './write-actions';

function createDocument(input: EditorWrite, signal: AbortSignal) {
  return requestApi({
    operation: 'documents.create',
    params: { collection: input.snapshot.collection.key },
    body: {
      locale: input.snapshot.editor.locale,
      data: input.data,
      folderId: input.folderId,
      ...(input.uploadId ? { uploadId: input.uploadId } : {}),
    },
    response: documentSchema,
    signal,
    idempotencyKey: input.key,
  });
}

function writeBody(input: EditorWrite, document: Document): Record<string, unknown> {
  const { locale } = input.snapshot.editor;
  const body = { revision: document.revision };
  if (input.action === 'copy') return { ...body, dataByLocale: input.dataByLocale };
  if (input.action === 'restore') return { ...body, versionId: input.versionId };
  if (input.action === 'publish' || input.action === 'unpublish') return { ...body, locale };
  if (input.action !== 'save' && input.action !== 'autosave') return body;
  const data = Object.keys(input.data).length > 0 ? { data: input.data } : {};
  return {
    ...body,
    locale,
    ...data,
    ...(input.action === 'autosave' ? { data: input.data } : { folderId: input.folderId }),
    ...(input.uploadId ? { uploadId: input.uploadId } : {}),
  };
}

export async function writeEditor(
  input: EditorWrite,
  signal: AbortSignal,
  replay = false,
): Promise<ApiResult<Document>> {
  const { document, collection } = input.snapshot;
  if (document === null) return createDocument(input, signal);
  if (input.action === 'restore' && !input.versionId) return failure('invalid_input', 400);
  const operation = writeOperation(input.action, false);
  const definition = getOperation(operation);
  if (replay && definition.idempotency !== 'required') return failure('invalid_input', 400);
  const context = replay ? null : await verifyWriteContext(input, signal);
  if (context && !context.ok) return context;
  return requestApi({
    operation,
    params: { collection: collection.key, id: document.id },
    ...(definition.method === 'DELETE'
      ? {
          query: {
            revision: document.revision,
            ...(input.action === 'unpublish' ? { locale: input.snapshot.editor.locale } : {}),
          },
        }
      : { body: writeBody(input, document) }),
    response: documentSchema,
    signal,
    ...(definition.idempotency === 'required' ? { idempotencyKey: input.key } : {}),
  });
}
