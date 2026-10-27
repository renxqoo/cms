import { pageApi, resetPageApi, ok } from './page-fixture';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCandidatePresentation } from '../use-candidate-presentation';
import { deferred, snapshot, editor, document } from './support';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';

beforeEach(() => {
  resetPageApi();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

it('keeps the newest candidate presentation when an earlier response arrives late and cancels requests on disposal', async () => {
  const first = deferred<ApiResult<unknown>>();
  const second = deferred<ApiResult<unknown>>();
  pageApi.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const source = snapshot({ editor: editor({ dynamicComponentProps: true }) });
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const view = renderHook(
    ({ title }) =>
      useCandidatePresentation({ snapshot: source, data: { title }, active: true, report }),
    { initialProps: { title: 'First' } },
  );
  expect(view.result.current.previewBusy).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  view.rerender({ title: 'Second' });
  expect(pageApi.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  await act(async () => {
    second.resolve(
      ok({
        behaviorHash: 'behavior',
        visibility: { 'title#title': true },
        componentProps: { title: { label: 'Second' } },
        choiceOptions: { choice: ['a'] },
      }),
    );
    await Promise.resolve();
  });
  expect(view.result.current.visibility).toEqual({ 'title#title': true });
  expect(view.result.current.componentProps).toEqual({ title: { label: 'Second' } });
  act(() => {
    first.resolve(ok({ behaviorHash: 'behavior', visibility: { 'title#title': false } }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(view.result.current.visibility).toEqual({ 'title#title': true });
  view.rerender({ title: 'Third' });
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(pageApi.request).toHaveBeenCalledTimes(2);
});

it('previews every bulk identity with one shared patch and reports failures and stale configuration without changing values', async () => {
  pageApi.request
    .mockResolvedValueOnce(failure('temporarily_unavailable', 503))
    .mockResolvedValueOnce(ok({ behaviorHash: 'changed', visibility: {} }));
  const source = snapshot({
    editor: editor({
      layout: [
        {
          ...editor().layout[0],
          id: 'title',
          name: 'title',
          label: 'Title',
          type: 'text',
          required: false,
          localized: true,
          write: 'allowed',
          constraints: { filterOptions: true },
        },
      ],
    }),
  });
  const docs = [document(), document({ id: '22222222-2222-4222-8222-222222222222', revision: 7 })];
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const view = renderHook(() =>
    useCandidatePresentation({
      snapshot: source,
      data: { title: 'Shared' },
      documents: docs,
      active: true,
      report,
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(pageApi.request.mock.calls[0]?.[0].body).toMatchObject({
    candidates: [
      { id: docs[0]?.id, revision: docs[0]?.revision, data: { title: 'Shared' } },
      { id: docs[1]?.id, revision: 7, data: { title: 'Shared' } },
    ],
  });
  expect(view.result.current.previewFailure?.status).toBe(503);
  await act(async () => {
    view.result.current.retry();
    await Promise.resolve();
  });
  expect(view.result.current.previewFailure?.status).toBe(409);
  expect(view.result.current.previewBusy).toBe(false);
  view.unmount();
});
