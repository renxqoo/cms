import type { ApiResult } from '../../api/result';
import { failure } from '../../api/result';
import type { EditorPreview, EditorNode } from '../../contracts/editor';
import type { EditorSnapshot } from './editor-read';
import type { FieldData } from '../fields/types';

interface Source {
  snapshot: EditorSnapshot | null;
  value: FieldData;
  generation: number;
}
export interface EditorPreviewState {
  visibility: Readonly<Record<string, boolean>>;
  componentProps: Readonly<Record<string, FieldData>>;
  choiceOptions: NonNullable<EditorPreview['choiceOptions']>;
  previewFailure: Extract<ApiResult<unknown>, { ok: false }> | null;
  previewBusy: boolean;
}
export interface PreviewRequest {
  (
    input: { snapshot: EditorSnapshot; data: FieldData },
    signal: AbortSignal,
  ): Promise<ApiResult<EditorPreview>>;
}
interface Options {
  request: PreviewRequest | undefined;
  source(): Source;
  update(state: Partial<EditorPreviewState>): void;
  report(result: ApiResult<unknown>): void;
  delayMs: number;
}
interface Runtime {
  options: Options;
  timer: ReturnType<typeof setTimeout> | null;
  active: AbortController | null;
  sequence: number;
  disposed: boolean;
}

export function hasCandidateRules(layout: readonly EditorNode[]): boolean {
  return layout.some(
    (node) =>
      node.condition === true ||
      node.constraints.filterOptions === true ||
      hasCandidateRules(node.children ?? []) ||
      (node.blocks ?? []).some((block) => hasCandidateRules(block.children)) ||
      (node.tabs ?? []).some((tab) => hasCandidateRules(tab.children)),
  );
}

function cancel(runtime: Runtime): void {
  runtime.sequence += 1;
  if (runtime.timer) clearTimeout(runtime.timer);
  runtime.timer = null;
  runtime.active?.abort();
  runtime.active = null;
}

async function request(
  runtime: Runtime,
  input: { source: Source & { snapshot: EditorSnapshot }; sequence: number },
): Promise<void> {
  if (!runtime.options.request || runtime.disposed) return;
  const controller = new AbortController();
  runtime.active = controller;
  let result: ApiResult<EditorPreview>;
  try {
    result = await runtime.options.request(
      { snapshot: input.source.snapshot, data: structuredClone(input.source.value) },
      controller.signal,
    );
  } catch {
    result = failure('request_failed', 0);
  }
  if (runtime.disposed || controller.signal.aborted || runtime.sequence !== input.sequence) return;
  runtime.active = null;
  runtime.options.report(result);
  runtime.options.update(
    result.ok
      ? {
          visibility: result.data.visibility,
          componentProps: result.data.componentProps ?? {},
          choiceOptions: result.data.choiceOptions ?? {},
          previewFailure: null,
          previewBusy: false,
        }
      : { previewFailure: result, previewBusy: false },
  );
}

function schedule(runtime: Runtime, immediate = false): void {
  cancel(runtime);
  const source = runtime.options.source();
  if (
    runtime.disposed ||
    !runtime.options.request ||
    !source.snapshot ||
    (!hasCandidateRules(source.snapshot.editor.layout) &&
      !source.snapshot.editor.dynamicComponentProps) ||
    source.snapshot.editor.intent === 'read'
  )
    return;
  runtime.options.update({ previewBusy: true, previewFailure: null });
  const input = { source: { ...source, snapshot: source.snapshot }, sequence: runtime.sequence };
  if (immediate) {
    void request(runtime, input);
    return;
  }
  runtime.timer = setTimeout(() => {
    runtime.timer = null;
    void request(runtime, input);
  }, runtime.options.delayMs);
}

export function createEditorPreview(options: Options) {
  const runtime: Runtime = { options, timer: null, active: null, sequence: 0, disposed: false };
  return {
    schedule: () => schedule(runtime),
    retry: () => schedule(runtime, true),
    cancel: () => cancel(runtime),
    start: () => {
      runtime.disposed = false;
    },
    dispose: () => {
      runtime.disposed = true;
      cancel(runtime);
    },
  };
}
