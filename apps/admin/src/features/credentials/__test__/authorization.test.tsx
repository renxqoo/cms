import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { AuthorizePage } from '../authorize-page';
import { articleCollection, articleRead, authorization, systemRead } from './credential-fixtures';

const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        params?: Record<string, string>;
        body?: unknown;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
  callback: vi.fn<(value: string, expected?: string) => boolean>(),
  login: vi.fn<(requestId: string) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../authorization-navigation', async (original) => ({
  ...(await original<object>()),
  returnToAuthorizationClient: controls.callback,
  returnToAuthorizationLogin: controls.login,
}));
function success<T>(data: T): ApiResult<T> {
  return { ok: true, status: 200, data, requestId: '' };
}
function view(requestId: string | null = authorization.id, locale: 'zh' | 'en' = 'en') {
  return render(
    <ShellProvider initial={parsePreferences({ locale })}>
      <AuthorizePage requestId={requestId} email="owner@example.test" />
    </ShellProvider>,
  );
}

beforeEach(() => {
  controls.callback.mockReturnValue(true);
  controls.request.mockImplementation((input) => {
    if (input.operation === 'credentials.getAuthorization')
      return Promise.resolve(success(authorization));
    if (input.operation === 'access.myOperations')
      return Promise.resolve(
        success({ rows: [articleRead, systemRead], total: 2, page: 1, pageSize: 100 }),
      );
    if (input.operation === 'collections.list')
      return Promise.resolve(success({ rows: [articleCollection] }));
    return Promise.resolve(
      success({ redirectTo: 'http://127.0.0.1:45832/callback?code=code&state=state' }),
    );
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it('shows the account, client and callback while offering only the current operation intersection', async () => {
  view();
  await screen.findByRole('checkbox', { name: 'Articles: documents.get' });
  expect(screen.getByText('Signed in as: owner@example.test')).toBeInTheDocument();
  expect(screen.getByText('CMS CLI (cms-cli)')).toBeInTheDocument();
  expect(screen.getByText('http://127.0.0.1:45832/callback')).toBeInTheDocument();
  expect(screen.getByText(/stay signed in and refresh/)).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'admins: admins.list' })).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Articles: documents.get' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Allow selected permissions' }));
  expect(
    screen.getByText('Select at least one available resource permission.'),
  ).toBeInTheDocument();
  expect(
    controls.request.mock.calls.some(
      ([input]) => input.operation === 'credentials.decideAuthorization',
    ),
  ).toBe(false);
});

it('submits explicitly selected grants once and returns only to the verified callback', async () => {
  view();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Articles: documents.get' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Agent laptop' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Allow selected permissions' }));
  await waitFor(() => expect(controls.callback).toHaveBeenCalledOnce());
  expect(controls.callback).toHaveBeenCalledWith(
    'http://127.0.0.1:45832/callback?code=code&state=state',
    authorization.redirectUri,
  );
  expect(
    controls.request.mock.calls.find(
      ([input]) => input.operation === 'credentials.decideAuthorization',
    )?.[0],
  ).toMatchObject({
    params: { requestId: authorization.id },
    body: { approved: true, grants: [articleRead], name: 'Agent laptop' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Allow selected permissions' }));
  expect(
    controls.request.mock.calls.filter(
      ([input]) => input.operation === 'credentials.decideAuthorization',
    ),
  ).toHaveLength(1);
});

it('rejects an application without granting any selected operations', async () => {
  view();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Articles: documents.get' }));
  fireEvent.click(screen.getByRole('button', { name: 'Deny access' }));
  await waitFor(() => expect(controls.callback).toHaveBeenCalledOnce());
  expect(
    controls.request.mock.calls.find(
      ([input]) => input.operation === 'credentials.decideAuthorization',
    )?.[0].body,
  ).toEqual({ approved: false, grants: [] });
});

it('never follows a response that fails callback validation', async () => {
  controls.callback.mockReturnValue(false);
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Deny access' }));
  expect(await screen.findByText(/return address failed the security check/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Deny access' })).toBeDisabled();
});

it('refuses an unsafe authorization callback before submitting a decision', async () => {
  const original = controls.request.getMockImplementation();
  controls.request.mockImplementation((input) =>
    input.operation === 'credentials.getAuthorization'
      ? Promise.resolve(success({ ...authorization, redirectUri: 'javascript:alert(1)' }))
      : original
        ? original(input)
        : Promise.resolve(failure('invalid_response', 0)),
  );
  view();
  await screen.findByText(/return address failed the security check/);
  expect(screen.getByRole('button', { name: 'Deny access' })).toBeDisabled();
});

it('reports expired requests without fetching a callback supplied by a query parameter', async () => {
  controls.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'credentials.getAuthorization'
        ? failure('not_found', 404)
        : input.operation === 'collections.list'
          ? success({ rows: [] })
          : success({ rows: [], total: 0, page: 1, pageSize: 100 }),
    ),
  );
  view();
  expect(
    await screen.findByText(/authorization request is invalid or expired/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Allow selected permissions' }),
  ).not.toBeInTheDocument();
  expect(controls.callback).not.toHaveBeenCalled();
});

it('returns an expired browser session to the same opaque authorization request', async () => {
  controls.request.mockImplementation(() => Promise.resolve(failure('unauthenticated', 401)));
  view();
  await waitFor(() => expect(controls.login).toHaveBeenCalledWith(authorization.id));
  expect(controls.callback).not.toHaveBeenCalled();
});

it('locks uncertain decisions and ignores late success after cancelling', async () => {
  const original = controls.request.getMockImplementation();
  let complete: ((result: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation((input) =>
    input.operation === 'credentials.decideAuthorization'
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : original
        ? original(input)
        : Promise.resolve(failure('invalid_response', 0)),
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Deny access' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
  await act(async () => {
    complete?.(success({ redirectTo: 'https://client.example/callback?code=late' }));
    await Promise.resolve();
  });
  expect(controls.callback).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Deny access' })).toBeDisabled();
  expect(screen.getByText(/authorization result is not confirmed/)).toBeInTheDocument();
});

it('returns a decision rejected for an expired session to the same login request', async () => {
  const original = controls.request.getMockImplementation();
  controls.request.mockImplementation((input) =>
    input.operation === 'credentials.decideAuthorization'
      ? Promise.resolve(failure('unauthenticated', 401))
      : original
        ? original(input)
        : Promise.resolve(failure('invalid_response', 0)),
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Deny access' }));
  await waitFor(() => expect(controls.login).toHaveBeenCalledWith(authorization.id));
});

it('aborts all in-flight authorization reads on unmount', async () => {
  controls.request.mockImplementation(
    (input) =>
      new Promise((resolve) => {
        input.signal.addEventListener('abort', () => resolve(failure('request_cancelled', 0)), {
          once: true,
        });
      }),
  );
  const rendered = view();
  expect(controls.request).toHaveBeenCalledTimes(3);
  rendered.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  expect(controls.request.mock.calls.every(([input]) => input.signal.aborted)).toBe(true);
});

it('disables a consent that reaches its server deadline and clears the timer on unmount', async () => {
  const original = controls.request.getMockImplementation();
  controls.request.mockImplementation((input) =>
    input.operation === 'credentials.getAuthorization'
      ? Promise.resolve(
          success({ ...authorization, expiresAt: new Date(Date.now() + 1000).toISOString() }),
        )
      : original
        ? original(input)
        : Promise.resolve(failure('invalid_response', 0)),
  );
  vi.useFakeTimers();
  const rendered = view();
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole('button', { name: 'Deny access' })).toBeEnabled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByRole('button', { name: 'Deny access' })).toBeDisabled();
  expect(screen.getByText(/authorization request is invalid or expired/)).toBeInTheDocument();
  rendered.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('renders an invalid opaque request in Chinese without making network requests', () => {
  view(null, 'zh');
  expect(screen.getByText('授权请求无效或已过期，请从应用重新开始登录。')).toBeInTheDocument();
  expect(controls.request).not.toHaveBeenCalled();
});

it('retries a failed permission catalogue without publishing an incomplete consent', async () => {
  const original = controls.request.getMockImplementation();
  let reads = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'access.myOperations' && reads++ === 0)
      return Promise.resolve(failure('backend_unavailable', 503));
    return original ? original(input) : Promise.resolve(failure('invalid_response', 0));
  });
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  expect(
    await screen.findByRole('checkbox', { name: 'Articles: documents.get' }),
  ).toBeInTheDocument();
  expect(
    controls.request.mock.calls.filter(
      ([input]) => input.operation === 'credentials.getAuthorization',
    ),
  ).toHaveLength(2);
});

it('does not offer consent when the registered collection catalogue fails', async () => {
  const original = controls.request.getMockImplementation();
  controls.request.mockImplementation((input) =>
    input.operation === 'collections.list'
      ? Promise.resolve(failure('backend_unavailable', 503))
      : original
        ? original(input)
        : Promise.resolve(failure('invalid_response', 0)),
  );
  view();
  await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Allow selected permissions' }),
  ).not.toBeInTheDocument();
});

it('regression: permits a verified default-port callback and an authorized collection absent from metadata', async () => {
  const original = controls.request.getMockImplementation();
  controls.request.mockImplementation((input) => {
    if (input.operation === 'collections.list') return Promise.resolve(success({ rows: [] }));
    if (input.operation === 'credentials.decideAuthorization')
      return Promise.resolve(
        success({ redirectTo: 'https://client.example/callback?code=a&state=b' }),
      );
    if (input.operation === 'credentials.getAuthorization')
      return Promise.resolve(
        success({ ...authorization, redirectUri: 'https://CLIENT.example:443/callback' }),
      );
    return original ? original(input) : Promise.resolve(failure('invalid_response', 0));
  });
  view();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'articles: documents.get' }));
  expect(screen.getByRole('button', { name: 'Deny access' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Allow selected permissions' }));
  await waitFor(() => expect(controls.callback).toHaveBeenCalledOnce());
  expect(
    controls.request.mock.calls.find(
      ([input]) => input.operation === 'credentials.decideAuthorization',
    )?.[0].body,
  ).toMatchObject({ approved: true, grants: [articleRead] });
});
