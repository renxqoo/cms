import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import { parsePreferences } from '../../../config/preferences';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { ManagementFeedback } from '../feedback';

function show(code: string, status = 400, locale: 'en' | 'zh' = 'en') {
  const error = failure(code, status, { requestId: 'trace-123' });
  error.error.message = 'Internal secret connection information';
  return render(
    <ShellProvider initial={parsePreferences({ locale })}>
      <ManagementFeedback error={error} />
    </ShellProvider>,
  );
}
afterEach(() => vi.resetAllMocks());

it.each([
  ['invalid_input', 'Check the entered values'],
  ['identifier_taken', 'already in use'],
  ['last_super_admin', 'effective super administrator'],
  ['idempotency_conflict', 'earlier submission'],
  ['binding_exists', 'already has a binding'],
  ['scope_mismatch', 'same scope'],
  ['invalid_scope', 'valid scope'],
  ['capacity_exceeded', 'server capacity'],
  ['payload_too_large', 'allowed size'],
  ['unsupported_media_type', 'not supported'],
  ['invalid_credentials', 'credentials are incorrect'],
  ['request_cancelled', 'Stopped waiting'],
  ['temporarily_unavailable', 'temporarily unavailable'],
  ['version_conflict', 'data changed elsewhere'],
  ['resource_in_use', 'resource is referenced'],
  ['forbidden', 'cannot perform'],
  ['endpoint_unbound', 'no active endpoint'],
  ['protected_resource', 'protected'],
  ['not_found', 'not found'],
  ['unauthenticated', 'no longer valid'],
  ['read_limit_exceeded', 'budget was exceeded'],
  ['read_timeout', 'budget was exceeded'],
  ['inconsistent_pagination', 'list changed'],
  ['unknown_backend_error', 'could not be completed'],
])('localizes %s without displaying internal backend messages', (code, text) => {
  show(code);
  expect(screen.getByRole('alert')).toHaveTextContent(text);
  expect(screen.getByRole('alert')).not.toHaveTextContent('Internal secret');
});

it('preserves true rate-limit advice and calls only an explicit retry action', () => {
  const retry = vi.fn<() => void>();
  const error = { ...failure('rate_limited', 429), retryAfterSeconds: 0 };
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <ManagementFeedback error={error} onRetry={retry} />
    </ShellProvider>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Wait 0 seconds');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('states an unknown mutation outcome without pretending it is a confirmed failure', () => {
  const error = failure('invalid_response', 502, { uncertain: true });
  render(
    <ShellProvider initial={parsePreferences({ locale: 'zh' })}>
      <ManagementFeedback error={error} />
    </ShellProvider>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('操作结果尚未确认');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('renders no error or fabricated success when there is no result', () => {
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <ManagementFeedback error={null} />
    </ShellProvider>,
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('regression: prototype property names in unknown error codes still produce safe fallback text', () => {
  show('constructor');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The request could not be completed. Try again.',
  );
});
