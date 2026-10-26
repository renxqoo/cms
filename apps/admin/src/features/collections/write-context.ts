import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor } from '../../contracts/editor';
import { documentSchema } from '../../contracts/documents';
import type { FieldData } from '../fields/types';
import { writablePatch } from '../fields/writable-data';
import type { EditorWrite } from './editor-controller';

function descriptorMatches(
  input: EditorWrite,
  metadata: CollectionEditor,
  locale: string,
): boolean {
  const { collection, document } = input.snapshot;
  if (!document || !metadata.document) return false;
  return (
    metadata.collection === collection.key &&
    metadata.intent === input.action &&
    metadata.mode === 'editing' &&
    metadata.locale === locale &&
    metadata.document.id === document.id &&
    metadata.document.revision === document.revision &&
    metadata.document.versionId === document.versionId &&
    metadata.schemaVersion === collection.schemaVersion &&
    metadata.behaviorHash === collection.behaviorHash &&
    metadata.mappingFingerprint === collection.mappingFingerprint
  );
}

async function actionDescriptor(
  input: EditorWrite,
  locale: string,
  signal: AbortSignal,
): Promise<ApiResult<CollectionEditor>> {
  const { document } = input.snapshot;
  if (!document) return failure('invalid_input', 400);
  const result = await requestApi({
    operation: 'collections.editor',
    params: { collection: document.collection },
    query: { intent: input.action, id: document.id, locale, mode: 'editing' },
    response: collectionEditorSchema,
    signal,
  });
  if (!result.ok) return result;
  if (!descriptorMatches(input, result.data, locale)) return failure('version_conflict', 409);
  const operationId = input.action === 'copy' ? 'documents.copy' : 'documents.autosave';
  return result.data.actions.some(
    (action) => action.operationId === operationId && action.state !== 'denied',
  )
    ? result
    : failure('forbidden', 403);
}

async function verifyCopyLocale(
  input: EditorWrite,
  value: { locale: string; patch: FieldData },
  signal: AbortSignal,
): Promise<ApiResult<true>> {
  const metadata = await actionDescriptor(input, value.locale, signal);
  if (!metadata.ok) return metadata;
  const { document } = input.snapshot;
  if (!document) return failure('invalid_input', 400);
  const result = await requestApi({
    operation: 'documents.get',
    params: { collection: document.collection, id: document.id },
    query: { locale: value.locale, fallback: [], depth: 0, mode: 'editing' },
    response: documentSchema,
    signal,
  });
  if (!result.ok) return result;
  if (result.data.revision !== document.revision || result.data.versionId !== document.versionId)
    return failure('version_conflict', 409);
  const patch = writablePatch(metadata.data.layout, result.data.data, value.patch);
  if (JSON.stringify(patch) !== JSON.stringify(value.patch)) return failure('forbidden', 403);
  return { ok: true, status: 200, data: true, requestId: result.requestId };
}

async function verifyCopy(input: EditorWrite, signal: AbortSignal): Promise<ApiResult<true>> {
  const entries = Object.entries(input.dataByLocale ?? {});
  if (
    entries.length === 0 ||
    entries.some(([locale]) => !input.snapshot.collection.locales.includes(locale))
  )
    return failure('invalid_input', 400);
  for (const [locale, patch] of entries) {
    const result = await verifyCopyLocale(input, { locale, patch }, signal);
    if (!result.ok) return result;
  }
  return { ok: true, status: 200, data: true, requestId: '' };
}

export async function verifyWriteContext(
  input: EditorWrite,
  signal: AbortSignal,
): Promise<ApiResult<unknown> | null> {
  if (input.action === 'copy') return verifyCopy(input, signal);
  if (input.action !== 'autosave') return null;
  const result = await actionDescriptor(input, input.snapshot.editor.locale, signal);
  if (!result.ok) return result;
  const { document } = input.snapshot;
  if (!document) return failure('invalid_input', 400);
  const patch = writablePatch(result.data.layout, document.data, input.data);
  return JSON.stringify(patch) === JSON.stringify(input.data) ? result : failure('forbidden', 403);
}
