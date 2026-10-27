'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { editorPreviewSchema } from '../../contracts/editor';
import type { Document } from '../../contracts/documents';
import type { FieldData } from '../fields/types';
import { writablePatch } from '../fields/writable-data';
import { createEditorPreview, hasCandidateRules } from './editor-preview-controller';
import type { EditorPreviewState, PreviewRequest } from './editor-preview-controller';
import { previewEditor } from './editor-preview';
import type { EditorSnapshot } from './editor-read';
import { contentEditorPolicy } from './policy';

interface Input {
  snapshot: EditorSnapshot | null;
  data: FieldData;
  documents?: readonly Document[];
  active: boolean;
  report: (result: ApiResult<unknown>) => void;
}

async function requestPresentation(
  input: Parameters<PreviewRequest>[0],
  documents: readonly Document[] | undefined,
  signal: AbortSignal,
) {
  if (!documents) return previewEditor(input, signal);
  const { snapshot } = input;
  const data = writablePatch(snapshot.editor.layout, {}, input.data);
  const result = await requestApi({
    operation: 'collections.previewEditor',
    params: { collection: snapshot.collection.key },
    body: {
      candidates: documents.map((document) => ({
        collection: snapshot.collection.key,
        intent: 'update',
        mode: 'editing',
        locale: snapshot.editor.locale,
        id: document.id,
        revision: document.revision,
        data,
      })),
    },
    response: editorPreviewSchema,
    signal,
  });
  return result.ok && result.data.behaviorHash !== snapshot.editor.behaviorHash
    ? failure('version_conflict', 409)
    : result;
}

function presentationRuntime() {
  const store = createStore<EditorPreviewState & { key: string }>(() => ({
    key: '',
    visibility: {},
    componentProps: {},
    choiceOptions: {},
    previewFailure: null,
    previewBusy: false,
  }));
  const runtime = {
    source: { snapshot: null as EditorSnapshot | null, value: {} as FieldData, generation: 0 },
    documents: undefined as readonly Document[] | undefined,
    key: '',
    report: null as ((result: ApiResult<unknown>) => void) | null,
  };
  const preview = createEditorPreview({
    source: () => runtime.source,
    request: (input, signal) => requestPresentation(input, runtime.documents, signal),
    update: (state) => store.setState({ ...state, key: runtime.key }),
    report: (result) => runtime.report?.(result),
    delayMs: contentEditorPolicy.previewDelayMs,
  });
  return {
    store,
    preview,
    update(input: Input, key: string) {
      runtime.source = {
        snapshot: input.snapshot,
        value: input.data,
        generation: runtime.source.generation + 1,
      };
      runtime.documents = input.documents;
      runtime.key = key;
      runtime.report = input.report;
    },
  };
}

function candidateKey(input: Input) {
  const editor = input.snapshot?.editor;
  return JSON.stringify([
    input.snapshot?.collection.key,
    editor?.document,
    editor?.intent,
    editor?.locale,
    editor?.behaviorHash,
    input.documents?.map(({ id, revision }) => ({ id, revision })),
    input.data,
  ]);
}

export function useCandidatePresentation(input: Input) {
  const { active } = input;
  const [instance] = useState(presentationRuntime);
  const state = useStore(instance.store);
  const editor = input.snapshot?.editor;
  const key = candidateKey(input);
  const dynamic = editor
    ? editor.dynamicComponentProps === true || hasCandidateRules(editor.layout)
    : false;
  const update = useEffectEvent((nextKey: string) => instance.update(input, nextKey));
  useEffect(() => {
    instance.preview.start();
    return () => instance.preview.dispose();
  }, [instance]);
  useEffect(() => {
    update(key);
    if (active) instance.preview.schedule();
    else instance.preview.cancel();
  }, [instance, active, key]);
  return presentationState({
    state,
    key,
    editor,
    dynamic,
    active: input.active,
    retry: () => instance.preview.retry(),
  });
}

function presentationState(input: {
  state: EditorPreviewState & { key: string };
  key: string;
  editor: EditorSnapshot['editor'] | undefined;
  dynamic: boolean;
  active: boolean;
  retry: () => void;
}) {
  const { state, key, editor, dynamic } = input;
  const current = state.key === key;
  return {
    visibility: current ? state.visibility : (editor?.visibility ?? {}),
    componentProps: current ? state.componentProps : (editor?.componentProps ?? {}),
    choiceOptions: current ? state.choiceOptions : (editor?.choiceOptions ?? {}),
    previewFailure: current ? state.previewFailure : null,
    previewBusy: input.active && dynamic && (!current || state.previewBusy),
    retry: input.retry,
  };
}

export function usePresentationValidity(input: {
  busy: boolean;
  failed: boolean;
  report: (key: string, error: string | null) => void;
  message: string;
}) {
  const report = useEffectEvent(input.report);
  useEffect(() => {
    report('$presentation', input.busy || input.failed ? input.message : null);
    return () => report('$presentation', null);
  }, [input.busy, input.failed, input.message]);
}
