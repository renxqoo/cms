import { StrictMode } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { ForgotPasswordForm } from '../forgot-password-form';
import { PasswordActionForm } from '../password-action-form';
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
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
const token = 'T'.repeat(43);

afterEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/');
});

function fillPasswords(password = '  a long password  ', confirm = password) {
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: confirm } });
}

function submitPassword() {
  fireEvent.submit(screen.getByRole('form'));
}

function renderPassword(kind: 'invitation' | 'reset' = 'reset') {
  window.history.replaceState({ retained: true }, '', `/reset-password#token=${token}`);
  return renderAuth(<PasswordActionForm kind={kind} />);
}

it('validates reset email and focuses the field without calling the API', () => {
  renderAuth(<ForgotPasswordForm />);
  fireEvent.submit(screen.getByRole('form'));
  expect(screen.getByText('Enter your email.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'invalid' },
  });
  fireEvent.submit(screen.getByRole('form'));
  expect(
    screen.getByText('Enter a valid email with no more than 255 characters.'),
  ).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
});

it('normalizes reset email and describes acceptance without claiming account existence or delivery', async () => {
  api.request.mockResolvedValue({ ok: true, status: 202, data: { accepted: true }, requestId: '' });
  renderAuth(<ForgotPasswordForm />);
  screen.getByRole<HTMLInputElement>('textbox', { name: 'Email' }).value =
    '  Person@Example.Test  ';
  fireEvent.submit(screen.getByRole('form'));
  await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
  expect(api.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'identity.requestPasswordReset',
    body: { email: 'person@example.test' },
  });
  expect(screen.getByText(/If this email belongs to an eligible account/)).toHaveTextContent(
    'Delivery is not confirmed.',
  );
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
});

it.each([
  ['rate_limited', 429, 'Too many requests. Try again later.'],
  ['invalid_input', 400, 'Check your input, then try again.'],
  ['backend_unavailable', 503, 'The request could not be completed. Try again later.'],
] as const)('shows safe reset request feedback for %s', async (code, status, message) => {
  api.request.mockResolvedValue({
    ...failure(code, status, { requestId: 'recover-123' }),
    retryAfterSeconds: 17,
  });
  renderAuth(<ForgotPasswordForm />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'user@example.test' },
  });
  fireEvent.submit(screen.getByRole('form'));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByText('Wait 17 seconds before trying again.')).toBeInTheDocument();
  expect(screen.getByText(/recover-123/)).toBeInTheDocument();
});

it('blocks duplicate reset requests while pending and preserves unknown cancellation outcomes', async () => {
  let done: ((result: ApiResult<unknown>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  renderAuth(<ForgotPasswordForm />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'user@example.test' },
  });
  const form = screen.getByRole('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(api.request).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
  expect(api.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(screen.getByText(/request result is not confirmed/)).toBeInTheDocument();
  fireEvent.submit(form);
  expect(api.request).toHaveBeenCalledOnce();
  await act(async () => {
    done?.({ ok: true, status: 202, data: { accepted: true }, requestId: '' });
    await Promise.resolve();
  });
  expect(screen.getByRole('form')).toBeInTheDocument();
});

it('aborts a reset email request when its page unmounts', () => {
  api.request.mockImplementation(() => new Promise(() => {}));
  const view = renderAuth(<ForgotPasswordForm />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'user@example.test' },
  });
  fireEvent.submit(screen.getByRole('form'));
  view.unmount();
  expect(api.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
});

it('does not request token validation when a fragment is missing or only supplied as query', () => {
  window.history.replaceState(null, '', `/reset-password?token=${token}`);
  renderAuth(<PasswordActionForm kind="reset" />);
  expect(screen.getByText(/A valid one-time link is required/)).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
});

it('clears a fragment immediately, retains Next history state and survives StrictMode effects', () => {
  window.history.replaceState({ retained: 'next-state' }, '', `/accept-invitation#token=${token}`);
  renderAuth(
    <StrictMode>
      <PasswordActionForm kind="invitation" />
    </StrictMode>,
  );
  expect(window.location.hash).toBe('');
  expect(window.history.state).toEqual({ retained: 'next-state' });
  expect(screen.getByRole('form', { name: 'Set your account password' })).toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain(token);
  expect(api.request).not.toHaveBeenCalled();
});

it('focuses invalid new passwords and mismatched confirmation without consuming the token', () => {
  renderPassword();
  fillPasswords('short', 'different');
  submitPassword();
  expect(screen.getByText('Use at least 15 Unicode characters.')).toBeInTheDocument();
  expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
  expect(screen.getByLabelText(/^New password/)).toHaveFocus();
  fillPasswords('a'.repeat(129));
  submitPassword();
  expect(
    screen.getByText('Use no more than 128 Unicode characters or 512 bytes.'),
  ).toBeInTheDocument();
  fillPasswords('a long new password', 'different');
  submitPassword();
  expect(screen.getByLabelText(/^Confirm new password/)).toHaveFocus();
  expect(api.request).not.toHaveBeenCalled();
});

it.each([
  [
    'invitation',
    'identity.acceptInvitation',
    'Your account is activated. Sign in with your new password.',
  ],
  [
    'reset',
    'identity.resetPassword',
    'Your password is reset and previous sessions are revoked. Sign in with your new password.',
  ],
] as const)(
  'uses the exact %s token operation and does not automatically sign in',
  async (kind, operation, message) => {
    api.request.mockResolvedValue({ ok: true, status: 204, data: undefined, requestId: '' });
    renderPassword(kind);
    fillPasswords();
    submitPassword();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(api.request.mock.calls[0]?.[0]).toMatchObject({
      operation,
      body: { token, newPassword: '  a long password  ' },
    });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/reset-password');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  },
);

it.each([
  ['unauthenticated', 401, 'This link is invalid, expired or already used. Request a new link.'],
  ['invalid_input', 400, 'Check your input, then try again.'],
  ['rate_limited', 429, 'Too many requests. Try again later.'],
  ['backend_unavailable', 503, 'The request could not be completed. Try again later.'],
] as const)('shows a safe password action error for %s', async (code, status, message) => {
  api.request.mockResolvedValue({
    ...failure(code, status, { requestId: 'action-123' }),
    retryAfterSeconds: 11,
  });
  renderPassword();
  fillPasswords();
  submitPassword();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByText('Wait 11 seconds before trying again.')).toBeInTheDocument();
  expect(screen.getByText(/action-123/)).toBeInTheDocument();
});

it('prevents retrying a token action when a gateway leaves the result uncertain', async () => {
  api.request.mockResolvedValue(failure('invalid_response', 502, { uncertain: true }));
  renderPassword();
  fillPasswords();
  submitPassword();
  expect(await screen.findByText(/The result is not confirmed/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Reset password$/ })).toBeDisabled();
  submitPassword();
  expect(api.request).toHaveBeenCalledOnce();
});

it('cancels a pending token action without treating a late response as success', async () => {
  let done: ((result: ApiResult<unknown>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  renderPassword('invitation');
  fillPasswords();
  submitPassword();
  submitPassword();
  expect(api.request).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
  expect(api.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  await act(async () => {
    done?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(screen.getByText(/The result is not confirmed/)).toBeInTheDocument();
  expect(
    screen.queryByText('Your account is activated. Sign in with your new password.'),
  ).not.toBeInTheDocument();
});

it('aborts a pending password action when its page unmounts', () => {
  api.request.mockImplementation(() => new Promise(() => {}));
  const view = renderPassword();
  fillPasswords();
  submitPassword();
  view.unmount();
  expect(api.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
});

it('provides the recovery forms in Chinese with the same password policy', () => {
  window.history.replaceState(null, '', `/reset-password#token=${token}`);
  renderAuth(<PasswordActionForm kind="reset" />, 'zh');
  expect(screen.getByRole('heading', { name: '重置密码' })).toBeInTheDocument();
  expect(screen.getByText(/15—128/)).toBeInTheDocument();
});

it('regression: reports the backend token_invalid 400 as an expired or used link', async () => {
  api.request.mockResolvedValue(failure('token_invalid', 400));
  renderPassword();
  fillPasswords();
  submitPassword();
  expect(
    await screen.findByText('This link is invalid, expired or already used. Request a new link.'),
  ).toBeInTheDocument();
});
