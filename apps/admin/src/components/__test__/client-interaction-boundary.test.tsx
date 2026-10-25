import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type * as LoginNavigation from '../../features/auth/login-navigation';
import type { Root } from 'react-dom/client';
import { ShellProvider } from '../shell/shell-provider';
import { AppShell } from '../shell/app-shell';
import { parsePreferences } from '../../config/preferences';
import { AuthLayout } from '../../features/auth/auth-layout';
import { LoginForm } from '../../features/auth/login-form';
import type { ApiResult } from '../../api/result';

const mocks = vi.hoisted(() => ({
  request: vi.fn<() => Promise<ApiResult<unknown>>>(),
  replace: vi.fn<() => void>(),
}));
vi.mock('../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../features/auth/login-navigation', async (original) => ({
  ...(await original<typeof LoginNavigation>()),
  replaceAfterLogin: mocks.replace,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/ui',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function serverDOM(children: ReactNode) {
  const content = (
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{children}</ShellProvider>
  );
  container = document.createElement('div');
  container.innerHTML = renderToString(content);
  document.body.append(container);
  return { content, element: container };
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    await Promise.resolve();
  });
  container?.remove();
  root = undefined;
  vi.resetAllMocks();
});

it('prevents native login submissions before hydration and restores a usable form after hydration', async () => {
  const { content, element } = serverDOM(
    <AuthLayout>
      <LoginForm />
    </AuthLayout>,
  );
  expect(element.querySelector('main')).toHaveAttribute('inert');
  expect(element.querySelector('input[name="email"]')).toBeDisabled();
  expect(element.querySelector('input[name="password"]')).toBeDisabled();
  expect(element.querySelector('button[type="submit"]')).toBeDisabled();
  expect(element.querySelector('[role="status"]')).toHaveTextContent(
    'Preparing interactive controls…',
  );
  const recover = vi.fn<(error: unknown) => void>();
  await act(async () => {
    root = hydrateRoot(element, content, { onRecoverableError: recover });
    await Promise.resolve();
  });
  expect(element.querySelector('main')).not.toHaveAttribute('inert');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Sign in$/ })).toBeEnabled();
  mocks.request.mockResolvedValue({
    ok: true,
    status: 200,
    data: { expiresAt: '2026-10-27T00:00:00.000Z' },
    requestId: '',
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'ready@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'a valid password' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Administrator sign in' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  expect(recover).not.toHaveBeenCalled();
});

it('keeps the shared sidebar inert until hydration has attached its first interaction', async () => {
  const { content, element } = serverDOM(
    <AppShell>
      <h1>Shared content</h1>
    </AppShell>,
  );
  const boundary = element.querySelector('[inert]');
  expect(boundary).toHaveTextContent('Shared content');
  expect(boundary).toHaveAttribute('aria-busy', 'true');
  await act(async () => {
    root = hydrateRoot(element, content);
    await Promise.resolve();
  });
  expect(element.querySelector('[inert]')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch language' }));
  expect(screen.getByText('组件工作台')).toBeInTheDocument();
});
