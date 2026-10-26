import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { collectionSchema, documentSchema } from '../../contracts/content';
import type { Collection, Document } from '../../contracts/content';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor } from '../../contracts/editor';
import { uploadSessionSchema } from '../../contracts/assets';
import type { UploadSession } from '../../contracts/assets';

export interface EditorSnapshot {
  collection: Collection;
  editor: CollectionEditor;
  document: Document | null;
  upload: UploadSession | null;
}
export interface EditorReadInput {
  collection: string;
  id?: string | undefined;
  locale?: string | undefined;
  intent: 'create' | 'read' | 'update' | 'autosave' | 'copy';
  uploadId?: string | undefined;
  signal: AbortSignal;
}

export function matchingSnapshot(snapshot: EditorSnapshot, input: EditorReadInput) {
  const { collection, editor, document } = snapshot;
  return (
    matchingEditorMetadata(input, collection, editor) &&
    collection.key === editor.collection &&
    collection.schemaVersion === editor.schemaVersion &&
    collection.behaviorHash === editor.behaviorHash &&
    collection.mappingFingerprint === editor.mappingFingerprint &&
    (document === null
      ? editor.document === null
      : document.collection === collection.key &&
        editor.document?.id === document.id &&
        editor.document.revision === document.revision &&
        editor.document.versionId === document.versionId &&
        document.trashedAt === null &&
        editor.document.trashedAt === null)
  );
}

async function readOnce(input: EditorReadInput): Promise<ApiResult<EditorSnapshot>> {
  const params = { collection: input.collection };
  const catalog = await requestApi({
    operation: 'collections.get',
    params,
    response: collectionSchema,
    signal: input.signal,
  });
  if (!catalog.ok) return catalog;
  if (input.locale && !catalog.data.locales.includes(input.locale))
    return failure('invalid_input', 400);
  const editor = await requestApi({
    operation: 'collections.editor',
    params,
    query: {
      intent: input.intent,
      mode: 'editing',
      ...(input.id ? { id: input.id } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.intent === 'read' ? { fallback: [] } : {}),
    },
    response: collectionEditorSchema,
    signal: input.signal,
  });
  if (!editor.ok) return editor;
  if (!matchingEditorMetadata(input, catalog.data, editor.data))
    return failure('version_conflict', 409);
  const document = await readDocument(input, editor.data.locale);
  if (!document.ok) return document;
  const upload = await readUpload(input, catalog.data);
  if (!upload.ok) return upload;

  return {
    ok: true,
    status: 200,
    requestId: editor.requestId,
    data: {
      collection: catalog.data,
      editor: editor.data,
      document: document.data,
      upload: upload.data,
    },
  };
}

async function readDocument(
  input: EditorReadInput,
  locale: string,
): Promise<ApiResult<Document | null>> {
  if (!input.id) return { ok: true, status: 200, requestId: '', data: null };
  return requestApi({
    operation: 'documents.get',
    params: { collection: input.collection, id: input.id },
    query: { locale, fallback: [], depth: 0, mode: 'editing' },
    response: documentSchema,
    signal: input.signal,
  });
}
async function readUpload(
  input: EditorReadInput,
  catalog: Collection,
): Promise<ApiResult<UploadSession | null>> {
  if (!input.uploadId) return { ok: true, status: 200, requestId: '', data: null };
  return readReadyUpload({ collection: catalog, uploadId: input.uploadId, signal: input.signal });
}
export async function readReadyUpload(input: {
  collection: Collection;
  uploadId: string;
  signal: AbortSignal;
}): Promise<ApiResult<UploadSession>> {
  const result = await requestApi({
    operation: 'assets.readUpload',
    params: { collection: input.collection.key, uploadId: input.uploadId },
    response: uploadSessionSchema,
    signal: input.signal,
  });
  if (!result.ok) return result;
  const upload = result.data;
  if (
    !input.collection.upload ||
    upload.collection !== input.collection.key ||
    upload.purpose !== 'create' ||
    upload.status !== 'ready' ||
    upload.documentId !== null ||
    upload.revision !== null ||
    upload.manifest === null ||
    Date.parse(upload.expiresAt) <= Date.now()
  )
    return failure('invalid_input', 409);
  return result;
}

export async function readEditor(input: EditorReadInput): Promise<ApiResult<EditorSnapshot>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await readOnce(input);
    if (!result.ok && result.error.code !== 'version_conflict') return result;
    if (result.ok && matchingSnapshot(result.data, input)) return result;
    if (input.signal.aborted) return failure('request_cancelled', 0);
  }
  return failure('version_conflict', 409);
}

export function matchingEditorMetadata(
  input: EditorReadInput,
  collection: Collection,
  editor: CollectionEditor,
) {
  const expectedLocale = input.locale ?? editor.locales.default;
  return (
    collection.key === input.collection &&
    editor.collection === input.collection &&
    editor.locale === expectedLocale &&
    collection.locales.includes(editor.locale) &&
    editor.locales.supported.includes(editor.locale) &&
    editor.intent === input.intent &&
    editor.mode === 'editing' &&
    metadataFallbackMatches(input.intent, editor) &&
    metadataDocumentMatches(input.id, editor.document)
  );
}
function metadataDocumentMatches(id: string | undefined, document: CollectionEditor['document']) {
  return id ? document?.id === id : document === null;
}

function metadataFallbackMatches(intent: EditorReadInput['intent'], editor: CollectionEditor) {
  const configured = Object.hasOwn(editor.locales.fallback, editor.locale)
    ? editor.locales.fallback[editor.locale]
    : [];
  const expected = intent === 'read' ? [] : (configured ?? []);
  return JSON.stringify(editor.fallback) === JSON.stringify(expected);
}
