import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { pageSchema } from '../../../contracts/access';
import { useAllPagesQuery, useApiQuery } from '../query';

const mock = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        signal: AbortSignal;
        params?: Record<string, string>;
        query?: Record<string, unknown>;
      }) => Promise<ApiResult<unknown>>
    >(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mock.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ reportResult: mock.report }),
}));
const response = z.object({ id: z.string() });
const page = pageSchema(response);
const key = (row: { id: string }) => row.id;
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: '', data };
}
function Item({
  id = 'first',
  enabled = true,
  contextKey,
}: {
  id?: string;
  enabled?: boolean;
  contextKey?: string;
}) {
  const query = useApiQuery({
    operation: 'roles.get',
    params: { id },
    response,
    enabled,
    ...(contextKey === undefined ? {} : { contextKey }),
  });
  return (
    <>
      <output data-testid="phase">{query.phase}</output>
      <output data-testid="data">{query.data?.id ?? 'none'}</output>
      <output data-testid="error">{query.error?.error.code ?? 'none'}</output>
      <button onClick={query.reload}>Reload</button>
    </>
  );
}
function AllItems() {
  const query = useAllPagesQuery({
    operation: 'roles.list',
    query: { q: 'real filter' },
    response: page,
    key,
  });
  return (
    <output>
      {query.phase}:{query.data?.length ?? 0}
    </output>
  );
}
afterEach(() => vi.resetAllMocks());

it('does not reload equivalent inline request objects on every render', async () => {
  mock.request.mockResolvedValue(ok({ id: 'first' }));
  const view = render(<Item />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('ready'));
  view.rerender(<Item />);
  expect(mock.request).toHaveBeenCalledOnce();
  expect(mock.request.mock.calls[0]?.[0].params).toEqual({ id: 'first' });
});

it('retains same-resource data while paused and after a failed reload without reporting it as ready', async () => {
  mock.request
    .mockResolvedValueOnce(ok({ id: 'first' }))
    .mockResolvedValueOnce(failure('backend_unavailable', 503));
  const view = render(<Item />);
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('first'));
  view.rerender(<Item enabled={false} />);
  expect(screen.getByTestId('phase')).toHaveTextContent('idle');
  expect(screen.getByTestId('data')).toHaveTextContent('first');
  view.rerender(<Item />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('failed'));
  expect(screen.getByTestId('data')).toHaveTextContent('first');
  expect(screen.getByTestId('error')).toHaveTextContent('backend_unavailable');
  expect(mock.report).toHaveBeenCalledOnce();
});

it('clears data immediately across resource keys and ignores an aborted late earlier response', async () => {
  let resolve: ((result: ApiResult<unknown>) => void) | undefined;
  let oldSignal: AbortSignal | undefined;
  mock.request
    .mockImplementationOnce((input) => {
      oldSignal = input.signal;
      return new Promise((done) => {
        resolve = done;
      });
    })
    .mockResolvedValueOnce(ok({ id: 'second' }));
  const view = render(<Item />);
  view.rerender(<Item id="second" />);
  expect(screen.getByTestId('data')).toHaveTextContent('none');
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('second'));
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {
    resolve?.(ok({ id: 'first' }));
    await Promise.resolve();
  });
  expect(screen.getByTestId('data')).toHaveTextContent('second');
});

it('regression: a new permission context clears same-resource data and cancels earlier work', async () => {
  let finish: ((result: ApiResult<unknown>) => void) | undefined;
  mock.request
    .mockResolvedValueOnce(ok({ id: 'old-context' }))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(ok({ id: 'current-context' }));
  const view = render(<Item contextKey="old-grants" />);
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('old-context'));
  view.rerender(<Item contextKey="pending-grants" />);
  expect(screen.getByTestId('data')).toHaveTextContent('none');
  const signal = mock.request.mock.calls.at(-1)?.[0].signal;
  view.rerender(<Item contextKey="current-grants" />);
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('current-context'));
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.(ok({ id: 'late-context' }));
    await Promise.resolve();
  });
  expect(screen.getByTestId('data')).toHaveTextContent('current-context');
  expect(mock.request.mock.calls.at(-1)?.[0].query).toEqual({});
});

it('does not repeatedly retry a forbidden key when access refresh pauses and reenables the query', async () => {
  mock.request
    .mockResolvedValueOnce(failure('forbidden', 403))
    .mockResolvedValueOnce(ok({ id: 'current' }));
  const view = render(<Item />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('failed'));
  view.rerender(<Item enabled={false} />);
  view.rerender(<Item />);
  expect(mock.request).toHaveBeenCalledOnce();
  expect(mock.report).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('current'));
  expect(mock.request).toHaveBeenCalledTimes(2);
});

it('regression: a temporary disabled permission context cannot restart forbidden requests', async () => {
  mock.request.mockResolvedValue(failure('forbidden', 403));
  const view = render(<Item contextKey="grants" />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('failed'));
  view.rerender(<Item enabled={false} contextKey="checking" />);
  view.rerender(<Item contextKey="grants" />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('failed'));
  expect(mock.request).toHaveBeenCalledOnce();
  mock.request.mockResolvedValue(ok({ id: 'newly-allowed' }));
  view.rerender(<Item contextKey="new-grants" />);
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('newly-allowed'));
});

it('does not send a disabled query and aborts pending work on unmount', async () => {
  const view = render(<Item enabled={false} />);
  expect(mock.request).not.toHaveBeenCalled();
  let signal: AbortSignal | undefined;
  let resolve: ((result: ApiResult<unknown>) => void) | undefined;
  mock.request.mockImplementation((input) => {
    ({ signal } = input);
    return new Promise((done) => {
      resolve = done;
    });
  });
  view.rerender(<Item />);
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve?.(failure('unauthenticated', 401));
    await Promise.resolve();
  });
  expect(mock.report).not.toHaveBeenCalled();
});

it('turns an unexpected transport rejection into observable failure and allows explicit reload', async () => {
  mock.request
    .mockRejectedValueOnce(new Error('Internal details'))
    .mockResolvedValueOnce(ok({ id: 'recovered' }));
  render(<Item />);
  await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('invalid_response'));
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('recovered'));
});

it('shares strict complete pagination rather than publishing only the first options page', async () => {
  mock.request
    .mockResolvedValueOnce(
      ok({
        rows: Array.from({ length: 100 }, (_, index) => ({ id: `item-${index}` })),
        total: 101,
        page: 1,
        pageSize: 100,
      }),
    )
    .mockResolvedValueOnce(ok({ rows: [{ id: 'last-item' }], total: 101, page: 2, pageSize: 100 }));
  render(<AllItems />);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ready:101'));
  expect(mock.request.mock.calls[1]?.[0].query).toEqual({
    q: 'real filter',
    page: 2,
    pageSize: 100,
  });
});

it('regression: revisiting a previously forbidden resource after a key change can load it again', async () => {
  mock.request
    .mockResolvedValueOnce(failure('forbidden', 403))
    .mockResolvedValueOnce(ok({ id: 'second' }))
    .mockResolvedValueOnce(ok({ id: 'first' }));
  const view = render(<Item />);
  await waitFor(() => expect(screen.getByTestId('phase')).toHaveTextContent('failed'));
  view.rerender(<Item id="second" />);
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('second'));
  view.rerender(<Item />);
  await waitFor(() => expect(screen.getByTestId('data')).toHaveTextContent('first'));
  expect(mock.request).toHaveBeenCalledTimes(3);
});
