import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import type { ApiResult } from '../../../api/client';
import type * as LoginNavigation from '../login-navigation';
import { LoginForm } from '../login-form';
import { useExpiredSession } from '../expired-session';
import { renderAuth } from './auth-support';

const api = vi.hoisted(() => ({
  request:
    vi.fn<(input: { operation: string; signal: AbortSignal }) => Promise<ApiResult<unknown>>>(),
  replace: vi.fn<(next: unknown) => void>(),
}));

vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../login-navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof LoginNavigation>()),
  replaceAfterLogin: api.replace,
}));

afterEach(() => vi.resetAllMocks());

function unavailable(): Extract<ApiResult<unknown>, { ok: false }> {
  return {
    ok: false,
    status: 503,
    error: { code: 'service_unavailable', message: 'Private details', requestId: '' },
    retryAfterSeconds: null,
    uncertain: false,
  };
}

it('confirms the expired cookie through the registered cleanup operation before enabling login', async () => {
  let finish: ((result: ApiResult<unknown>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderAuth(<LoginForm expired />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking the expired session…');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  expect(api.request.mock.calls[0]?.[0].operation).toBe('session.expire');
  await act(async () => {
    finish?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Your session expired. Sign in again.');
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

it('preserves a session during a cleanup outage and retries only after user input', async () => {
  api.request.mockResolvedValueOnce(unavailable());
  api.request.mockResolvedValueOnce({ ok: true, status: 204, data: undefined, requestId: '' });
  renderAuth(<LoginForm expired />);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your current session information is preserved.',
  );
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  expect(api.request).toHaveBeenCalledOnce();
  fireEvent.click(retry);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  expect(api.request).toHaveBeenCalledTimes(2);
});

it('leaves safely when the cleanup detects a valid newer session', async () => {
  api.request.mockResolvedValue({
    ...unavailable(),
    status: 409,
    error: { code: 'session_changed', message: 'The session changed', requestId: '' },
  });
  renderAuth(<LoginForm expired next="//external.invalid" />);
  await waitFor(() => expect(api.replace).toHaveBeenCalledWith('/dashboard'));
  expect(api.request).toHaveBeenCalledOnce();
});

it('does not treat an unrelated conflict as a valid newer session', async () => {
  api.request.mockResolvedValue({
    ...unavailable(),
    status: 409,
    error: { code: 'unknown_conflict', message: 'Private details', requestId: '' },
  });
  renderAuth(<LoginForm expired />);
  await screen.findByRole('button', { name: 'Try again' });
  expect(api.replace).not.toHaveBeenCalled();
});

it('aborts initial cleanup and ignores its late response when the page unmounts', async () => {
  let finish: ((result: ApiResult<unknown>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderAuth(<LoginForm expired />);
  const signal = api.request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(api.replace).not.toHaveBeenCalled();
});

it('aborts an explicit cleanup retry when the page unmounts', async () => {
  api.request.mockResolvedValueOnce(unavailable());
  api.request.mockImplementationOnce(() => new Promise(() => {}));
  const view = renderAuth(<LoginForm expired />);
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  const signal = api.request.mock.calls[1]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('regression: rapid cleanup retries cannot start overlapping requests before React renders', async () => {
  api.request.mockResolvedValueOnce(unavailable());
  api.request.mockImplementation(() => new Promise(() => {}));
  const flow = renderHook(() => useExpiredSession(true, '/dashboard'));
  await waitFor(() => expect(flow.result.current.state).toBe('failed'));
  act(() => {
    void flow.result.current.retry();
    void flow.result.current.retry();
  });
  expect(api.request).toHaveBeenCalledTimes(2);
});
