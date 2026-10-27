import type { EditorSnapshot } from '../editor-read';
import type { FieldData } from '../../fields/types';
import { afterEach, expect, it, vi } from 'vitest';
import { createEditorPreview } from '../editor-preview-controller';
import type { PreviewRequest, EditorPreviewState } from '../editor-preview-controller';
import type { EditorPreview, EditorNode } from '../../../contracts/editor';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { deferred, snapshot, editor, success } from './support';

afterEach(() => vi.useRealTimers());
function source(): { snapshot: EditorSnapshot; value: FieldData; generation: number } {
  return {
    snapshot: snapshot({
      editor: editor({
        layout: [
          {
            id: 'title',
            name: 'title',
            type: 'text',
            label: 'Title',
            required: false,
            localized: false,
            write: 'allowed',
            constraints: {},
            condition: true,
          },
        ],
      }),
    }),
    value: { title: 'First' },
    generation: 1,
  };
}

it('regression: stale preview responses cannot replace visibility for a newer form candidate', async () => {
  const current = source();
  const first = deferred<ApiResult<EditorPreview>>();
  const second = deferred<ApiResult<EditorPreview>>();
  const request = vi
    .fn<PreviewRequest>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  let state: Partial<EditorPreviewState> = {};
  const preview = createEditorPreview({
    request,
    source: () => current,
    update: (patch) => {
      state = { ...state, ...patch };
    },
    report: vi.fn<(result: ApiResult<unknown>) => void>(),
    delayMs: 0,
  });
  preview.schedule();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  current.value = { title: 'Second' };
  current.generation += 1;
  preview.schedule();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[0]?.[1].aborted).toBe(true);
  second.resolve(success({ behaviorHash: 'behavior', visibility: { 'detail#detail': true } }));
  await vi.waitFor(() => expect(state.visibility).toEqual({ 'detail#detail': true }));
  first.resolve(success({ behaviorHash: 'behavior', visibility: { 'detail#detail': false } }));
  await Promise.resolve();
  expect(state.visibility).toEqual({ 'detail#detail': true });
  expect(current.value).toEqual({ title: 'Second' });
  preview.dispose();
});

it('cleans up scheduled and active previews on disposal, and displays failures without replacing form values', async () => {
  vi.useFakeTimers();
  const current = source();
  const request = vi.fn<PreviewRequest>().mockResolvedValue(failure('invalid_input', 400));
  const update = vi.fn<(patch: Partial<EditorPreviewState>) => void>();
  const preview = createEditorPreview({
    request,
    source: () => current,
    update,
    report: vi.fn<(result: ApiResult<unknown>) => void>(),
    delayMs: 250,
  });
  preview.schedule();
  preview.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  expect(request).not.toHaveBeenCalled();
  preview.start();
  preview.retry();
  await vi.advanceTimersByTimeAsync(0);
  expect(update).toHaveBeenLastCalledWith({
    previewFailure: failure('invalid_input', 400),
    previewBusy: false,
  });
  expect(current.value).toEqual({ title: 'First' });
  preview.dispose();
});

it('regression: filterOptions without a condition still refresh candidate choices', async () => {
  const current = source();
  const [field] = current.snapshot.editor.layout;
  if (!field) throw new Error('Missing field');
  delete field.condition;
  field.type = 'select';
  field.constraints = { options: ['a', 'b'], filterOptions: true };
  const request = vi.fn<PreviewRequest>().mockResolvedValue(
    success({
      behaviorHash: 'behavior',
      visibility: {},
      choiceOptions: { 'title#title': ['b'] },
    }),
  );
  let state: Partial<EditorPreviewState> = {};
  const preview = createEditorPreview({
    request,
    source: () => current,
    update: (patch) => {
      state = { ...state, ...patch };
    },
    report: vi.fn<(result: ApiResult<unknown>) => void>(),
    delayMs: 0,
  });
  preview.schedule();
  await vi.waitFor(() => expect(state.choiceOptions).toEqual({ 'title#title': ['b'] }));
  expect(current.value).toEqual({ title: 'First' });
  preview.dispose();
});

it('regression: registered props alone refresh even when an initially empty layout has no condition', async () => {
  const current = source();
  current.snapshot.editor.layout = [];
  current.snapshot.editor.dynamicComponentProps = true;
  const request = vi.fn<PreviewRequest>().mockResolvedValue(
    success({
      behaviorHash: 'behavior',
      visibility: {},
      componentProps: { '$collection:Status:site/status': { caption: 'Candidate status' } },
    }),
  );
  let state: Partial<EditorPreviewState> = {};
  const preview = createEditorPreview({
    request,
    source: () => current,
    update: (patch) => {
      state = { ...state, ...patch };
    },
    report: vi.fn<(result: ApiResult<unknown>) => void>(),
    delayMs: 0,
  });
  preview.schedule();
  await vi.waitFor(() =>
    expect(state.componentProps).toEqual({
      '$collection:Status:site/status': { caption: 'Candidate status' },
    }),
  );
  preview.dispose();
});

it.each(['children', 'blocks', 'tabs'] as const)(
  'nested %s candidate rules refresh before presenting a new draft',
  async (kind) => {
    const current = source();
    const [field] = current.snapshot.editor.layout;
    if (!field) throw new Error('Missing field');
    const parent: EditorNode = {
      ...field,
      id: 'container',
      type: 'group',
      condition: undefined,
      children: kind === 'children' ? [field] : [],
      blocks:
        kind === 'blocks' ? [{ id: 'block', key: 'block', label: 'Block', children: [field] }] : [],
      tabs: kind === 'tabs' ? [{ id: 'tab', label: 'Tab', children: [field] }] : [],
    };
    delete parent.condition;
    current.snapshot.editor.layout = [parent];
    const request = vi
      .fn<PreviewRequest>()
      .mockResolvedValue(
        success({ behaviorHash: 'behavior', visibility: { 'container.title#title': false } }),
      );
    let state: Partial<EditorPreviewState> = {};
    const preview = createEditorPreview({
      request,
      source: () => current,
      update: (patch) => {
        state = { ...state, ...patch };
      },
      report: vi.fn<(result: ApiResult<unknown>) => void>(),
      delayMs: 0,
    });
    preview.retry();
    await vi.waitFor(() => expect(state.visibility).toEqual({ 'container.title#title': false }));
    expect(request).toHaveBeenCalledTimes(1);
    preview.dispose();
  },
);
it('network failures can retry and read-only or missing editor contexts never schedule work', async () => {
  const current: { snapshot: EditorSnapshot | null; value: FieldData; generation: number } =
    source();
  const request = vi
    .fn<PreviewRequest>()
    .mockRejectedValueOnce(new Error('Disconnected'))
    .mockResolvedValue(success({ behaviorHash: 'behavior', visibility: {} }));
  let state: Partial<EditorPreviewState> = {};
  const preview = createEditorPreview({
    request,
    source: () => current,
    update: (patch) => {
      state = { ...state, ...patch };
    },
    report: vi.fn<(result: ApiResult<unknown>) => void>(),
    delayMs: 0,
  });
  preview.retry();
  await vi.waitFor(() =>
    expect(state.previewFailure).toMatchObject({ error: { code: 'request_failed' } }),
  );
  preview.retry();
  await vi.waitFor(() => expect(state.previewFailure).toBeNull());
  expect(state.choiceOptions).toEqual({});
  expect(state.componentProps).toEqual({});
  if (!current.snapshot) throw new Error('Missing snapshot');
  current.snapshot.editor.intent = 'read';
  preview.retry();
  expect(request).toHaveBeenCalledTimes(2);
  current.snapshot = null;
  preview.retry();
  expect(request).toHaveBeenCalledTimes(2);
  preview.dispose();
  const disabled = createEditorPreview({
    request: undefined,
    source: () => current,
    update: () => {},
    report: () => {},
    delayMs: 0,
  });
  disabled.retry();
  disabled.dispose();
  expect(request).toHaveBeenCalledTimes(2);
});
