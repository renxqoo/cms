'use client';
import { useEffect, useState } from 'react';
import { matchingEditorMetadata } from './read-editor';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import { collectionEditorSchema } from '../../contracts/editor';
import type { CollectionEditor } from '../../contracts/editor';
import type { Collection, Document } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { ManagementFeedback } from '../management-shared/feedback';
import { FieldRenderer } from '../fields/field-renderer';
import type { FieldData, FieldServices } from '../fields/types';
import type { ContentFailure } from './channel-types';
import type { ContentMessages } from './content-messages';
export const batchEditorLimit = 10;
export async function readBatchEditor(input: {
  collection: Collection;
  documents: readonly Document[];
  locale: string;
  signal: AbortSignal;
}) {
  if (input.documents.length === 0 || input.documents.length > batchEditorLimit)
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
      !matchingEditorMetadata(
        {
          collection: input.collection.key,
          id: document.id,
          locale: input.locale,
          intent: 'update',
          signal: input.signal,
        },
        input.collection,
        editor,
      ) ||
      !batchRevisionMatches(editor, input.collection, document)
    )
      return failure('version_conflict', 409);
    if (
      !editor.actions.some(
        (action) => action.operationId === 'documents.update' && action.state !== 'denied',
      )
    )
      return failure('forbidden', 403);
    if (
      first &&
      (JSON.stringify(editor.layout) !== JSON.stringify(first.layout) ||
        JSON.stringify(editor.actions) !== JSON.stringify(first.actions))
    )
      return failure('forbidden', 403);
    first = editor;
  }
  return { ok: true as const, status: 200, requestId: '', data: first };
}
export function BatchEditor({
  collection,
  documents,
  locale,
  value,
  onChange,
  onValidity,
  services,
  onReady,
  messages: t,
}: {
  collection: Collection;
  documents: readonly Document[];
  locale: string;
  value: FieldData;
  onChange: (value: FieldData) => void;
  onValidity: (id: string, error: string | null) => void;
  services: FieldServices;
  onReady: (editor: CollectionEditor | null) => void;
  messages: ContentMessages;
}) {
  const { reportResult } = useAccessControl();
  const [state, setState] = useState<{
    editor: CollectionEditor | null;
    error: ContentFailure | null;
  }>({ editor: null, error: null });
  const key = JSON.stringify(
    documents.map((document) => [document.id, document.revision, document.versionId]),
  );
  useEffect(() => {
    const controller = new AbortController();
    const rows = documents;
    void readBatchEditor({ collection, documents: rows, locale, signal: controller.signal }).then(
      (result) => {
        if (controller.signal.aborted) return result;
        reportResult(result);
        const editor = result.ok ? result.data : null;
        setState({ editor, error: result.ok ? null : result });
        onReady(editor);
        return result;
      },
    );
    return () => controller.abort();
  }, [collection, locale, reportResult, onReady, documents]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t.batchUpdate} · ≤ {batchEditorLimit}
      </p>
      <ManagementFeedback error={state.error} />
      {state.editor ? (
        <FieldRenderer
          idPrefix="batch"
          layout={state.editor.layout}
          value={value}
          onChange={onChange}
          onValidityChange={onValidity}
          resetKey={key}
          locale={locale}
          services={services}
          richTextNodes={state.editor.richTextNodes}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{state.error ? t.unavailable : t.loading}</p>
      )}
    </div>
  );
}

function batchRevisionMatches(
  editor: CollectionEditor,
  collection: Collection,
  document: Document,
) {
  return (
    editor.schemaVersion === collection.schemaVersion &&
    editor.behaviorHash === collection.behaviorHash &&
    editor.mappingFingerprint === collection.mappingFingerprint &&
    editor.document?.id === document.id &&
    editor.document.revision === document.revision &&
    editor.document.versionId === document.versionId &&
    editor.document.trashedAt === null
  );
}
