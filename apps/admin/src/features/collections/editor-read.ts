import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { failure } from '../../api/result';
import { collectionSchema } from '../../contracts/content';
import type { Collection } from '../../contracts/content';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor } from '../../contracts/editor';
import { documentSchema, documentPageSchema } from '../../contracts/documents';
import type { Document } from '../../contracts/documents';

export interface EditorTarget {
  collection: string;
  id: string | null;
  locale: string | null;
  intent: 'create' | 'update' | 'read';
}

export interface EditorSnapshot {
  collection: Collection;
  editor: CollectionEditor;
  document: Document | null;
}

function matchingDocument(snapshot: EditorSnapshot, id: string | null) {
  const { editor, document, collection } = snapshot;
  if (id === null) return editor.document === null && document === null;
  if (!document || !editor.document) return false;
  return (
    document.id === id &&
    document.collection === collection.key &&
    editor.document.id === document.id &&
    editor.document.revision === document.revision &&
    editor.document.versionId === document.versionId &&
    document.trashedAt === null
  );
}

export function matchingEditor(snapshot: EditorSnapshot, target: EditorTarget): boolean {
  const { collection, editor } = snapshot;
  if (target.id === null && collection.singleton && snapshot.document)
    return matchingEditor(snapshot, { ...target, id: snapshot.document.id, intent: 'read' });
  return (
    collection.key === target.collection &&
    editor.collection === collection.key &&
    editor.schemaVersion === collection.schemaVersion &&
    editor.behaviorHash === collection.behaviorHash &&
    editor.mappingFingerprint === collection.mappingFingerprint &&
    editor.intent === target.intent &&
    editor.mode === 'editing' &&
    (target.locale === null || editor.locale === target.locale) &&
    matchingDocument(snapshot, target.id)
  );
}

async function singletonTarget(
  collection: Collection,
  target: EditorTarget,
  signal: AbortSignal,
): Promise<ApiResult<EditorTarget>> {
  if (target.id !== null || !collection.singleton)
    return { ok: true, status: 200, data: target, requestId: '' };
  const result = await requestApi({
    operation: 'documents.list',
    params: { collection: collection.key },
    query: {
      page: 1,
      pageSize: 1,
      mode: 'editing',
      fallback: [],
      depth: 0,
      ...(target.locale ? { locale: target.locale } : {}),
    },
    response: documentPageSchema,
    signal,
  });
  if (!result.ok) return result;
  const [document] = result.data.rows;
  if (result.data.total > 1) return failure('invalid_response', 200);
  return {
    ok: true,
    status: 200,
    requestId: result.requestId,
    data: document ? { ...target, id: document.id, intent: 'read' } : target,
  };
}

function metadataRequest(target: EditorTarget, signal: AbortSignal) {
  return requestApi({
    operation: 'collections.editor',
    params: { collection: target.collection },
    query: {
      intent: target.intent,
      ...(target.id ? { id: target.id } : {}),
      ...(target.locale ? { locale: target.locale } : {}),
      mode: 'editing',
      ...(target.intent === 'read' ? { fallback: [] } : {}),
    },
    response: collectionEditorSchema,
    signal,
  });
}

function documentRequest(
  target: EditorTarget,
  locale: string,
  signal: AbortSignal,
): Promise<ApiResult<Document | null>> {
  if (!target.id) return Promise.resolve({ ok: true, status: 200, data: null, requestId: '' });
  return requestApi({
    operation: 'documents.get',
    params: { collection: target.collection, id: target.id },
    query: { locale, fallback: [], depth: 0, mode: 'editing' },
    response: documentSchema,
    signal,
  });
}

async function readSnapshot(
  target: EditorTarget,
  signal: AbortSignal,
): Promise<ApiResult<EditorSnapshot>> {
  const catalog = await requestApi({
    operation: 'collections.get',
    params: { collection: target.collection },
    response: collectionSchema,
    signal,
  });
  if (!catalog.ok) return catalog;
  const resolved = await singletonTarget(catalog.data, target, signal);
  if (!resolved.ok) return resolved;
  const metadata = await metadataRequest(resolved.data, signal);
  if (!metadata.ok) return metadata;
  const document = await documentRequest(resolved.data, metadata.data.locale, signal);
  if (!document.ok) return document;
  return {
    ok: true,
    status: 200,
    requestId: metadata.requestId,
    data: { collection: catalog.data, editor: metadata.data, document: document.data },
  };
}

export async function readEditor(
  target: EditorTarget,
  signal: AbortSignal,
): Promise<ApiResult<EditorSnapshot>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await readSnapshot(target, signal);
    if (!result.ok) return result;
    if (matchingEditor(result.data, target)) return result;
    if (signal.aborted) return failure('request_cancelled', 0);
  }
  return failure('version_conflict', 409);
}

export async function readArchivedDocument(
  target: EditorTarget,
  signal: AbortSignal,
): Promise<ApiResult<Document | null>> {
  if (!target.id) return failure('invalid_input', 400);
  const result = await requestApi({
    operation: 'documents.list',
    params: { collection: target.collection },
    query: {
      page: 1,
      pageSize: 1,
      trashed: true,
      mode: 'editing',
      fallback: [],
      depth: 0,
      ...(target.locale ? { locale: target.locale } : {}),
      where: { field: 'id', operator: 'eq', value: target.id },
    },
    response: documentPageSchema,
    signal,
  });
  if (!result.ok) return result;
  return { ok: true, status: 200, requestId: result.requestId, data: result.data.rows[0] ?? null };
}
