import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { Collection } from '../../contracts/content';
import type { Document } from '../../contracts/documents';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor, EditorNode } from '../../contracts/editor';
import { contentEditorPolicy } from './policy';

export function bulkEditorLayout(nodes: readonly EditorNode[]): EditorNode[] {
  return nodes
    .filter((node) => node.disabled?.bulkEdit !== true)
    .map((node) => ({
      ...node,
      ...(node.children ? { children: bulkEditorLayout(node.children) } : {}),
      ...(node.tabs
        ? { tabs: node.tabs.map((tab) => ({ ...tab, children: bulkEditorLayout(tab.children) })) }
        : {}),
      ...(node.blocks
        ? {
            blocks: node.blocks.map((block) => ({
              ...block,
              children: bulkEditorLayout(block.children),
            })),
          }
        : {}),
    }));
}

export async function readBulkEditor(input: {
  collection: Collection;
  documents: readonly Document[];
  locale: string;
  signal: AbortSignal;
}): Promise<ApiResult<CollectionEditor>> {
  if (
    input.documents.length === 0 ||
    input.documents.length > contentEditorPolicy.maximumBulkUpdates
  )
    return failure('invalid_input', 400);
  let first: CollectionEditor | null = null;
  for (const document of input.documents) {
    const result = await requestApi({
      operation: 'collections.editor',
      params: { collection: input.collection.key },
      query: { intent: 'update', id: document.id, locale: input.locale, mode: 'editing' },
      response: collectionEditorSchema,
      signal: input.signal,
    });
    if (!result.ok) return result;
    const editor = result.data;
    if (
      !matchingBulkDescriptor(
        { collection: input.collection, locale: input.locale, document },
        editor,
      ) ||
      !matchingProjection(first, editor)
    )
      return failure('version_conflict', 409);
    first ??= editor;
  }
  return first
    ? { ok: true, status: 200, data: first, requestId: '' }
    : failure('invalid_response', 200);
}

function matchingProjection(first: CollectionEditor | null, editor: CollectionEditor): boolean {
  if (!first) return true;
  return (
    JSON.stringify(editor.layout) === JSON.stringify(first.layout) &&
    JSON.stringify(editor.actions.find((action) => action.operationId === 'documents.update')) ===
      JSON.stringify(first.actions.find((action) => action.operationId === 'documents.update'))
  );
}

function matchingBulkDescriptor(
  input: { collection: Collection; locale: string; document: Document },
  editor: CollectionEditor,
): boolean {
  const { collection, document, locale } = input;
  const identity = editor.document;
  if (
    !identity ||
    identity.id !== document.id ||
    identity.revision !== document.revision ||
    identity.versionId !== document.versionId
  )
    return false;
  const matches =
    document.collection === collection.key &&
    editor.collection === collection.key &&
    editor.schemaVersion === collection.schemaVersion &&
    editor.behaviorHash === collection.behaviorHash &&
    editor.mappingFingerprint === collection.mappingFingerprint;
  return (
    matches &&
    editor.intent === 'update' &&
    editor.locale === locale &&
    editor.mode === 'editing' &&
    editor.actions.some(
      (action) => action.operationId === 'documents.update' && action.state !== 'denied',
    )
  );
}
