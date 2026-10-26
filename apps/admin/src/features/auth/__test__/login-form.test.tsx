import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ApiResult } from '../../../api/client';
import type * as LoginNavigation from '../login-navigation';
import { LoginForm } from '../login-form';
import { AuthLayout } from '../auth-layout';
import { renderAuth } from './auth-support';

const api = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        body?: unknown;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
  replace: vi.fn<(next: unknown) => void>(),
  reload: vi.fn<() => void>(),
}));

vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../login-navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof LoginNavigation>()),
  replaceAfterLogin: api.replace,
  checkLoginSession: api.reload,
}));

afterEach(() => vi.resetAllMocks());

function failure(code: string, status = 401): Extract<ApiResult<unknown>, { ok: false }> {
  return {
    ok: false,
    status,
    error: {
      code,
      message: 'Internal server details must not be displayed',
      requestId: 'request-123',
    },
    retryAfterSeconds: null,
    uncertain: false,
  };
}

function fill(email = 'owner@example.com', password = 'correct password') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: password },
  });
}

function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Administrator sign in' }));
}

it('renders an independent bilingual auth layout and preserves drafts across preference changes', () => {
  renderAuth(
    <AuthLayout>
      <LoginForm />
    </AuthLayout>,
    'zh',
  );
  fireEvent.change(screen.getByRole('textbox', { name: '邮箱' }), {
    target: { value: 'draft@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/^密码/), {
    target: { value: 'a draft password' },
  });
  expect(screen.getByText('OneAster')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '忘记密码？' })).toHaveAttribute(
    'href',
    '/forgot-password',
  );
  fireEvent.click(screen.getByRole('button', { name: '切换主题' }));
  expect(document.documentElement).toHaveClass('dark');
  fireEvent.click(screen.getByRole('button', { name: '切换语言' }));
  expect(screen.getByRole('heading', { name: 'Administrator sign in' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('draft@example.com');
  expect(screen.getByLabelText(/^Password/)).toHaveValue('a draft password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change theme' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
  expect(screen.getByLabelText(/^密码/)).toHaveAttribute('type', 'password');
  expect(document.documentElement).not.toHaveClass('dark');
});

it('shows required feedback and focuses the first invalid input without sending credentials', () => {
  renderAuth(<LoginForm />);
  submit();
  expect(screen.getByText('Enter your email.')).toBeInTheDocument();
  expect(screen.getByText('Enter your password.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
  expect(screen.getByLabelText(/^Password/)).toHaveAttribute('aria-invalid', 'true');
  expect(api.request).not.toHaveBeenCalled();
  fill();
  expect(screen.queryByText('Enter your email.')).not.toBeInTheDocument();
});

it.each(['bad-email', `${'a'.repeat(250)}@example.com`])(
  'rejects invalid email %s before the API boundary',
  (email) => {
    renderAuth(<LoginForm />);
    fill(email);
    submit();
    expect(
      screen.getByText('Enter a valid email with no more than 255 characters.'),
    ).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  },
);

it('focuses a missing password when the email is valid', () => {
  renderAuth(<LoginForm />);
  fill('owner@example.com', '');
  submit();
  expect(screen.getByLabelText(/^Password/)).toHaveFocus();
});

it('normalizes only email and submits 128 Unicode password characters with spaces intact', async () => {
  api.request.mockResolvedValue({
    ok: true,
    status: 200,
    data: { expiresAt: '2026-10-27T00:00:00.000Z' },
    requestId: 'signed-in',
  });
  renderAuth(<LoginForm next="https://external.invalid" />);
  const password = ` ${'😀'.repeat(126)} `;
  fill('OWNER@EXAMPLE.COM', password);
  submit();
  await waitFor(() => expect(api.replace).toHaveBeenCalledWith('/dashboard'));
  expect(api.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'identity.login',
    body: { email: 'owner@example.com', password },
  });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it('rejects 129 Unicode password characters without truncating input', () => {
  renderAuth(<LoginForm />);
  const password = '😀'.repeat(129);
  fill('owner@example.com', password);
  submit();
  expect(
    screen.getByText('Passwords must not exceed 128 Unicode characters or 512 bytes.'),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/^Password/)).toHaveValue(password);
  expect(api.request).not.toHaveBeenCalled();
});

it('accepts a nonempty password consisting only of spaces', async () => {
  api.request.mockResolvedValue(failure('invalid_credentials'));
  renderAuth(<LoginForm />);
  fill('owner@example.com', '   ');
  submit();
  await screen.findByText('The email or password is incorrect.');
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    email: 'owner@example.com',
    password: '   ',
  });
});

it('retains credentials after an explicit error and never displays raw upstream messages', async () => {
  api.request.mockResolvedValue(failure('invalid_credentials'));
  renderAuth(<LoginForm />);
  fill();
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('owner@example.com');
  expect(screen.getByLabelText(/^Password/)).toHaveValue('correct password');
  expect(screen.queryByText(/Internal server details/)).not.toBeInTheDocument();
  expect(screen.getByText('Request ID: request-123')).toBeInTheDocument();
});

it('localizes backend field errors without echoing backend text', async () => {
  const response = failure('invalid_input', 400);
  response.error.fieldErrors = [
    { field: 'email', message: 'secret' },
    { field: 'password', message: 'secret' },
    { field: 'other', message: 'secret' },
  ];
  api.request.mockResolvedValue(response);
  renderAuth(<LoginForm />);
  fill();
  submit();
  await screen.findByText('Check your email and password, then try again.');
  expect(screen.getAllByText('Check this value.')).toHaveLength(2);
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});

it('shows Retry-After for a rate limit and retries only on a new submission', async () => {
  api.request.mockResolvedValue({ ...failure('rate_limited', 429), retryAfterSeconds: 47 });
  renderAuth(<LoginForm />);
  fill();
  submit();
  await screen.findByText('Wait 47 seconds before trying again.');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Too many sign-in attempts. Try again later.',
  );
  expect(api.request).toHaveBeenCalledOnce();
  submit();
  await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
});

it.each([
  ['service_unavailable', 'The identity service is temporarily unavailable. Try again later.'],
  ['unknown_problem', 'The request could not be completed. Check your connection and try again.'],
])('provides safe recovery for %s', async (code, message) => {
  api.request.mockResolvedValue({
    ...failure(code, 503),
    error: { code, message: 'private', requestId: '' },
  });
  renderAuth(<LoginForm />);
  fill();
  submit();
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByText(/Request ID/)).not.toBeInTheDocument();
});

it('describes a lost response as unconfirmed and lets the user check the current session', async () => {
  api.request.mockResolvedValue({ ...failure('request_timeout', 0), uncertain: true });
  renderAuth(<LoginForm />);
  fill();
  submit();
  const check = await screen.findByRole('button', { name: 'Check session' });
  expect(screen.getByRole('status')).toHaveTextContent('The sign-in result is not confirmed.');
  expect(api.request).toHaveBeenCalledOnce();
  fireEvent.click(check);
  expect(api.reload).toHaveBeenCalledOnce();
});

it('blocks duplicate submissions and ignores a response arriving after cancellation', async () => {
  let finish: ((result: ApiResult<unknown>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  renderAuth(<LoginForm />);
  fill();
  submit();
  submit();
  expect(api.request).toHaveBeenCalledOnce();
  const signal = api.request.mock.calls[0]?.[0].signal;
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole('status')).toHaveTextContent('Stopped waiting.');
  await act(async () => {
    finish?.({ ok: true, status: 200, data: {}, requestId: '' });
    await Promise.resolve();
  });
  expect(api.replace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

it('regression: successful login stays locked until the full document replacement completes', async () => {
  api.request.mockResolvedValue({
    ok: true,
    status: 200,
    data: { expiresAt: '2026-10-27T00:00:00.000Z' },
    requestId: '',
  });
  renderAuth(<LoginForm />);
  fill();
  submit();
  await waitFor(() => expect(api.replace).toHaveBeenCalledWith('/dashboard'));
  submit();
  expect(api.request).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
});

it('aborts pending login work when the form unmounts', () => {
  api.request.mockImplementation(() => new Promise(() => {}));
  const view = renderAuth(<LoginForm />);
  fill();
  submit();
  const signal = api.request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('blocks login during a server-side session outage and offers a deliberate reload', () => {
  renderAuth(<LoginForm unavailable />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  submit();
  expect(api.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(api.reload).toHaveBeenCalledOnce();
});

it('submits credentials filled before React receives change events', async () => {
  api.request.mockResolvedValue({
    ok: true,
    status: 200,
    data: { expiresAt: '2026-10-27T00:00:00.000Z' },
    requestId: '',
  });
  renderAuth(<LoginForm />);
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Email' }).value = 'autofill@example.test';
  screen.getByLabelText<HTMLInputElement>(/^Password/).value = '  retained password  ';
  submit();
  await waitFor(() => expect(api.request).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    email: 'autofill@example.test',
    password: '  retained password  ',
  });
});
