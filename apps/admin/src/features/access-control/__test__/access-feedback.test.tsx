import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../../management-shared/read-all-pages';
import { failure } from '../../../api/result';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { AccessFeedback } from '../access-feedback';

const mock = vi.hoisted(() => {
  const state: { phase: 'ready' | 'loading' | 'failed'; error: ApiFailure | null } = {
    phase: 'ready',
    error: null,
  };
  return { state, refresh: vi.fn<() => void>() };
});
vi.mock('../provider', () => ({
  useAccessControl: () => ({ ...mock.state, refresh: mock.refresh }),
}));
function view(empty = false, invalid = false) {
  return render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <AccessFeedback empty={empty} invalid={invalid} />
    </ShellProvider>,
  );
}
afterEach(() => {
  mock.state.phase = 'ready';
  mock.state.error = null;
  vi.resetAllMocks();
});

it('regression: loading access announces a single status before management actions become available', () => {
  mock.state.phase = 'loading';
  view();
  expect(screen.getByRole('status')).toHaveTextContent('Checking access');
});
it('keeps management paused after failure and exposes only a deliberate retry', () => {
  mock.state.phase = 'failed';
  mock.state.error = failure('backend_unavailable', 503);
  view();
  expect(
    screen.getByText('Access could not be confirmed. Management actions are paused.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(mock.refresh).toHaveBeenCalledOnce();
});
it('distinguishes invalid configured pages from an empty available menu', () => {
  const current = view(false, true);
  expect(
    screen.getByText('Some menu pages are not registered. Their entries are disabled.'),
  ).toBeInTheDocument();
  current.unmount();
  view(true, false);
  expect(screen.getByText('No menu is available for this account.')).toBeInTheDocument();
});
it('adds no fabricated status when valid navigation is ready', () => {
  view();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
