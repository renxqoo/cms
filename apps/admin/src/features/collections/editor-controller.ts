import { initialEditorState } from './editor-state';
import { createStore } from 'zustand/vanilla';
import { createEditorPreview } from './editor-preview-controller';
import type { EditorPreviewState, PreviewRequest } from './editor-preview-controller';
import { contentEditorPolicy } from './policy';
import type { StoreApi } from 'zustand/vanilla';
import type { ApiResult } from '../../api/result';
import { failure } from '../../api/result';
import type { Document } from '../../contracts/documents';
import type { FieldData } from '../fields/types';
import { writablePatch } from '../fields/writable-data';
import { initializeFieldData } from '../fields/initialize-data';
import type { EditorSnapshot, EditorTarget } from './editor-read';
import { writeReplayable } from './write-actions';
import type { WriteAction } from './write-actions';

export type EditorFailure = Extract<ApiResult<unknown>, { ok: false }>;
export type { WriteAction } from './write-actions';
export interface EditorWrite {
  editorSessionId?: string;
  action: WriteAction;
  snapshot: EditorSnapshot;
  data: FieldData;
  folderId: string | null;
  uploadId: string | null;
  key: string;
  generation: number;
  dataByLocale?: Readonly<Record<string, FieldData>>;
  versionId?: string;
}
export interface ContentEditorState extends EditorPreviewState {
  phase: 'loading' | 'ready' | 'failed';
  snapshot: EditorSnapshot | null;
  value: FieldData;
  errors: Readonly<Record<string, string>>;
  folderId: string | null;
  uploadId: string | null;
  busy: boolean;
  externalBusy: boolean;
  failure: EditorFailure | null;
  pending: EditorWrite | null;
  latest: EditorSnapshot | null;
  saved: boolean;
  generation: number;
  resetEpoch: number;
}
interface EditorOptions {
  target: EditorTarget;
  load: (target: EditorTarget, signal: AbortSignal) => Promise<ApiResult<EditorSnapshot>>;
  readArchived: (target: EditorTarget, signal: AbortSignal) => Promise<ApiResult<Document | null>>;
  write: (
    input: EditorWrite,
    signal: AbortSignal,
    replay?: boolean,
  ) => Promise<ApiResult<Document>>;
  createId: () => string;
  preview?: PreviewRequest;
  report: (result: ApiResult<unknown>) => void;
  onCreated: (document: Document) => void;
  onArchived: () => void;
  onCommitted?: (document: Document) => void;
}
interface EditorRuntime {
  preview: ReturnType<typeof createEditorPreview>;
  options: EditorOptions;
  store: StoreApi<ContentEditorState>;
  active: AbortController | null;
  disposed: boolean;
  target: EditorTarget;
}

export function editorDirty(state: ContentEditorState): boolean {
  if (!state.snapshot) return false;
  if (Object.keys(state.errors).length > 0) return true;
  const baseline = state.snapshot.document?.data ?? {};
  return (
    Object.keys(writablePatch(state.snapshot.editor.layout, baseline, state.value)).length > 0 ||
    state.folderId !== (state.snapshot.document?.folderId ?? null) ||
    state.uploadId !== null
  );
}

function adopt(runtime: EditorRuntime, snapshot: EditorSnapshot, preserve = false) {
  runtime.preview.cancel();
  runtime.store.setState((state) => ({
    phase: 'ready',
    snapshot,
    visibility: snapshot.editor.visibility,
    componentProps: snapshot.editor.componentProps ?? {},
    choiceOptions: snapshot.editor.choiceOptions ?? {},
    previewFailure: null,
    previewBusy: false,
    latest: null,
    failure: null,
    pending: null,
    busy: false,
    value: preserve
      ? state.value
      : (snapshot.document?.data ??
        initializeFieldData(
          snapshot.editor.layout,
          structuredClone(snapshot.editor.initialData ?? {}),
          runtime.options.createId,
        )),
    errors: preserve ? state.errors : {},
    folderId: preserve ? state.folderId : (snapshot.document?.folderId ?? null),
    uploadId: preserve ? state.uploadId : null,
    saved: false,
    resetEpoch: preserve ? state.resetEpoch : state.resetEpoch + 1,
  }));
}

async function reload(runtime: EditorRuntime, preserve = false) {
  if (runtime.active) return;
  const controller = new AbortController();
  runtime.active = controller;
  runtime.store.setState({ busy: true });
  const result = await runtime.options.load(runtime.target, controller.signal);
  if (runtime.disposed || controller.signal.aborted) return;
  runtime.active = null;
  runtime.options.report(result);
  if (result.ok) {
    adopt(runtime, result.data, preserve);
    if (runtime.target.id === null && result.data.document) {
      runtime.target = { ...runtime.target, id: result.data.document.id, intent: 'read' };
      runtime.options.onCreated(result.data.document);
    }
  } else
    runtime.store.setState({
      busy: false,
      phase: runtime.store.getState().snapshot ? 'ready' : 'failed',
      failure: result,
    });
}

async function readCurrent(runtime: EditorRuntime) {
  const { snapshot } = runtime.store.getState();
  if (runtime.active || !snapshot || (!snapshot.document && !snapshot.collection.singleton)) return;
  const controller = new AbortController();
  runtime.active = controller;
  runtime.store.setState({ busy: true });
  const { pending } = runtime.store.getState();
  if (pending?.action === 'archive' && (await verifyArchived(runtime, pending, controller))) return;
  const result = await runtime.options.load(runtime.target, controller.signal);
  if (runtime.disposed || controller.signal.aborted) return;
  runtime.active = null;
  runtime.options.report(result);
  runtime.store.setState({
    busy: false,
    ...(result.ok ? { latest: result.data } : { failure: result }),
  });
}

async function verifyArchived(
  runtime: EditorRuntime,
  pending: EditorWrite,
  controller: AbortController,
): Promise<boolean> {
  const result = await runtime.options.readArchived(runtime.target, controller.signal);
  if (runtime.disposed || controller.signal.aborted) return true;
  runtime.options.report(result);
  if (result.ok && !result.data) return false;
  runtime.active = null;
  if (result.ok && result.data) completedNavigation(runtime, pending, result.data);
  else if (!result.ok) runtime.store.setState({ busy: false, failure: result });
  return true;
}

function completedNavigation(
  runtime: EditorRuntime,
  input: EditorWrite,
  document: Document,
): boolean {
  if (input.action === 'copy') {
    runtime.active = null;
    runtime.store.setState({ busy: false, pending: null });
    runtime.options.onCreated(document);
    return true;
  }
  if (input.action !== 'archive') return false;
  runtime.active = null;
  runtime.store.setState({
    busy: false,
    pending: null,
    value: document.data,
    snapshot: { ...input.snapshot, document },
    folderId: document.folderId,
    uploadId: null,
  });
  runtime.options.onArchived();
  return true;
}

async function refreshWritten(
  runtime: EditorRuntime,
  input: EditorWrite,
  output: { document: Document; controller: AbortController },
) {
  const { document, controller } = output;
  const created = runtime.target.id === null;
  runtime.target = {
    ...runtime.target,
    id: document.id,
    intent: runtime.target.intent === 'create' ? 'update' : runtime.target.intent,
  };
  const result = await runtime.options.load(runtime.target, controller.signal);
  if (runtime.disposed || controller.signal.aborted) return;
  runtime.active = null;
  runtime.options.report(result);
  if (result.ok) {
    adopt(
      runtime,
      result.data,
      input.action === 'autosave' || runtime.store.getState().generation !== input.generation,
    );
    runtime.store.setState((state) => {
      const uploadId = state.uploadId === input.uploadId ? null : state.uploadId;
      return { saved: !editorDirty({ ...state, uploadId }), uploadId };
    });
  } else
    runtime.store.setState({
      phase: 'failed',
      busy: false,
      snapshot: { ...input.snapshot, document },
      failure: result,
      pending: null,
      uploadId: null,
    });
  if (created) runtime.options.onCreated(document);
  else if (result.ok && input.action !== 'autosave' && !editorDirty(runtime.store.getState()))
    runtime.options.onCommitted?.(document);
}

async function execute(
  runtime: EditorRuntime,
  input: EditorWrite,
  replay = false,
): Promise<boolean> {
  const controller = new AbortController();
  runtime.active = controller;
  runtime.store.setState({ busy: true, failure: null, saved: false });
  const result = replay
    ? await runtime.options.write(input, controller.signal, true)
    : await runtime.options.write(input, controller.signal);
  if (runtime.disposed || controller.signal.aborted) return false;
  runtime.options.report(result);
  if (!result.ok) {
    runtime.active = null;
    runtime.store.setState({
      busy: false,
      failure: result,
      pending: result.uncertain ? input : null,
    });
    if (result.status === 409) await readCurrent(runtime);
    return false;
  }
  if (!completedNavigation(runtime, input, result.data))
    await refreshWritten(runtime, input, { document: result.data, controller });
  return true;
}

function writeBlocked(runtime: EditorRuntime): boolean {
  const state = runtime.store.getState();
  return (
    runtime.active !== null ||
    state.phase !== 'ready' ||
    state.busy ||
    state.externalBusy ||
    state.pending !== null ||
    state.snapshot === null ||
    state.failure?.error.code === 'version_conflict' ||
    Object.keys(state.errors).length > 0
  );
}

async function submit(
  runtime: EditorRuntime,
  action: WriteAction,
  options: { versionId?: string; dataByLocale?: Readonly<Record<string, FieldData>> } = {},
): Promise<boolean> {
  if (writeBlocked(runtime)) return false;
  const state = runtime.store.getState();
  const { snapshot } = state;
  if (!snapshot) return false;
  const saving = action === 'save' || action === 'autosave';
  const dirty = editorDirty(state);
  if (saving && snapshot.document && !dirty) return false;
  if (!saving && dirty) {
    runtime.store.setState({ failure: failure('unsaved_changes', 400) });
    return false;
  }
  const data = writablePatch(snapshot.editor.layout, snapshot.document?.data ?? {}, state.value);
  if (emptyAutosave(action, data, state.uploadId)) return false;
  return execute(runtime, {
    action,
    snapshot,
    data,
    folderId: state.folderId,
    uploadId: state.uploadId,
    key: runtime.options.createId(),
    generation: state.generation,
    ...(options.dataByLocale ? { dataByLocale: options.dataByLocale } : {}),
    ...(options.versionId ? { versionId: options.versionId } : {}),
  });
}

function setValidity(runtime: EditorRuntime, key: string, error: string | null) {
  runtime.store.setState((state) => {
    if ((error === null && !Object.hasOwn(state.errors, key)) || state.errors[key] === error)
      return state;
    return {
      errors:
        error === null
          ? Object.fromEntries(Object.entries(state.errors).filter(([name]) => name !== key))
          : { ...state.errors, [key]: error },
      generation: state.generation + 1,
      saved: false,
    };
  });
}

async function adoptCurrent(runtime: EditorRuntime, preserve: boolean) {
  const { latest } = runtime.store.getState();
  if (!latest || runtime.active) return;
  if (runtime.target.id === null && latest.document) {
    runtime.target = {
      ...runtime.target,
      id: latest.document.id,
      intent: preserve ? 'update' : 'read',
    };
    await reload(runtime, preserve);
    runtime.options.onCreated(latest.document);
  } else adopt(runtime, latest, preserve);
}

export function createContentEditor(options: EditorOptions) {
  const store = createStore<ContentEditorState>(initialEditorState);
  const preview = createEditorPreview({
    request: options.preview,
    source: () => store.getState(),
    update: (patch) => store.setState(patch),
    report: options.report,
    delayMs: contentEditorPolicy.previewDelayMs,
  });
  const runtime: EditorRuntime = {
    preview,
    options,
    store,
    active: null,
    disposed: false,
    target: { ...options.target },
  };
  return editorCommands(runtime);
}

function editorCommands(runtime: EditorRuntime) {
  const { store, preview } = runtime;
  return {
    store,
    start: () => {
      runtime.disposed = false;
      preview.start();
      return reload(runtime);
    },
    reload: (preserve = false) => reload(runtime, preserve),
    submit: (action: Exclude<WriteAction, 'copy'>, versionId?: string) =>
      submit(runtime, action, versionId ? { versionId } : {}),
    copy: (dataByLocale: Readonly<Record<string, FieldData>>) =>
      copyDocument(runtime, dataByLocale),
    readCurrent: () => readCurrent(runtime),
    change: (value: FieldData) => {
      store.setState((state) => ({ value, generation: state.generation + 1, saved: false }));
      preview.schedule();
    },
    retryPreview: () => preview.retry(),
    validity: (key: string, error: string | null) => setValidity(runtime, key, error),
    setFolder: (folderId: string | null) =>
      store.setState((state) => ({ folderId, generation: state.generation + 1, saved: false })),
    setUpload: (uploadId: string) =>
      store.setState((state) => ({ uploadId, generation: state.generation + 1, saved: false })),
    setExternalBusy: (externalBusy: boolean) => store.setState({ externalBusy }),
    adoptCurrent: () => adoptCurrent(runtime, false),
    rebaseCurrent: () => adoptCurrent(runtime, true),
    retry: () => {
      const { pending } = store.getState();
      if (!pending || runtime.active) return Promise.resolve();
      return writeReplayable(pending.action, pending.snapshot.document === null)
        ? execute(runtime, pending, true)
        : readCurrent(runtime);
    },
    dispose: () => {
      runtime.disposed = true;
      preview.dispose();
      runtime.active?.abort();
      runtime.active = null;
    },
  };
}

function emptyAutosave(action: WriteAction, data: FieldData, uploadId: string | null) {
  return action === 'autosave' && Object.keys(data).length === 0 && uploadId === null;
}

function copyDocument(
  runtime: EditorRuntime,
  dataByLocale: Readonly<Record<string, FieldData>>,
): Promise<boolean> {
  const { pending } = runtime.store.getState();
  if (pending?.action === 'copy')
    return runtime.active ? Promise.resolve(false) : execute(runtime, pending, true);
  return submit(runtime, 'copy', { dataByLocale });
}
