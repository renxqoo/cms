import { useEffect, useState } from 'react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoadingProvider } from '@new-cms/ui/feedback';
import { ShellProvider } from '../../shell-provider';
import { NavigationProgress } from '../../navigation-progress';
import { parsePreferences } from '../../../../config/preferences';
import { AppNavigationProvider, useAppNavigation, useNavigationState } from '../provider';
import { AppLink } from '../app-link';
import { safeAppHref } from '../safe-href';
import type { NavigationAttempt } from '../types';

const route = vi.hoisted(() => ({
  pathname: '/ui/documents',
  search: '',
  push: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
  replace: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ push: route.push, replace: route.replace }),
}));

interface LinkBoundaryProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean;
  onNavigate?: (event: { preventDefault: () => void }) => void;
}

vi.mock('next/link', () => ({
  default({
    href,
    children,
    onNavigate,
    replace: _replace,
    scroll: _scroll,
    prefetch: _prefetch,
    ...props
  }: LinkBoundaryProps) {
    return (
      <a
        {...props}
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onNavigate?.({ preventDefault: () => event.preventDefault() });
        }}
      >
        {children}
      </a>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Controls({ guarded }: { guarded: boolean }) {
  const { adapter, push, replace } = useAppNavigation();
  const state = useNavigationState();
  const [pending, setPending] = useState<NavigationAttempt | null>(null);
  useEffect(() => (guarded ? adapter.subscribe(setPending) : undefined), [adapter, guarded]);
  return (
    <>
      <AppLink href="/ui/lists">List link</AppLink>
      <AppLink href="/ui/inputs" replace scroll={false}>
        Replace link
      </AppLink>
      <AppLink href="javascript:alert(1)">Blocked link</AppLink>
      <button onClick={() => push('/ui/lists?status=draft')}>Push draft</button>
      <button onClick={() => replace('?q=media')}>Replace query</button>
      <button onClick={() => push('https://example.invalid')}>Unsafe push</button>
      <button onClick={() => push('#details')}>Push hash</button>
      <button onClick={() => replace('#summary')}>Replace hash</button>
      <button
        onClick={() => {
          if (pending) {
            adapter.commit(pending);
            setPending(null);
          }
        }}
      >
        Approve
      </button>
      <button
        onClick={() => {
          if (pending) {
            adapter.cancel(pending);
            setPending(null);
          }
        }}
      >
        Cancel
      </button>
      <output aria-label="Pending target">{pending?.href}</output>
      <output aria-label="Navigation event">{state.lastEvent?.status}</output>
      <NavigationProgress />
    </>
  );
}

function fixture(guarded = false) {
  route.pathname = '/ui/documents';
  route.search = '';
  window.history.replaceState({ __NA: true, tree: 'DOCUMENTS' }, '', '/ui/documents');
  function content() {
    return (
      <ShellProvider initial={parsePreferences({ locale: 'en' })}>
        <LoadingProvider>
          <AppNavigationProvider>
            <Controls guarded={guarded} />
          </AppNavigationProvider>
        </LoadingProvider>
      </ShellProvider>
    );
  }
  const view = render(content());
  function commit(href: string) {
    const url = new URL(href, window.location.href);
    route.pathname = url.pathname;
    route.search = url.search;
    window.history.pushState({ __NA: true, tree: url.pathname }, '', href);
    view.rerender(content());
  }
  return { ...view, commit };
}

it('link navigation waits for approval and progress completes only after the router commits the target', async () => {
  const view = fixture(true);
  fireEvent.click(screen.getByRole('link', { name: 'List link' }));
  expect(screen.getByLabelText('Pending target')).toHaveTextContent('/ui/lists');
  expect(route.push).not.toHaveBeenCalled();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(route.push).toHaveBeenCalledWith('/ui/lists', undefined);
  expect(screen.getByRole('progressbar', { name: 'Opening page' })).toBeInTheDocument();
  expect(screen.getByLabelText('Navigation event')).toHaveTextContent('start');
  view.commit('/ui/lists');
  await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Navigation event')).toHaveTextContent('complete');
});

it('cancelled programmatic navigation never calls the router and a replace link preserves its options', () => {
  const view = fixture(true);
  fireEvent.click(screen.getByRole('button', { name: 'Push draft' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(route.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Navigation event')).toHaveTextContent('cancel');
  fireEvent.click(screen.getByRole('link', { name: 'Replace link' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  expect(route.replace).toHaveBeenCalledWith('/ui/inputs', { scroll: false });
  view.commit('/ui/inputs');
});

it('safe query navigation delegates while unsafe links and programmatic targets cannot escape the app', () => {
  fixture();
  expect(screen.queryByRole('link', { name: 'Blocked link' })).not.toBeInTheDocument();
  expect(screen.getByText('Blocked link')).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Unsafe push' }));
  expect(route.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Replace query' }));
  expect(route.replace).toHaveBeenCalledWith('/ui/documents?q=media', undefined);
});

it('same-document hash navigation keeps Next state and does not ask the document guard to leave', async () => {
  fixture(true);
  const { length } = window.history;
  fireEvent.click(screen.getByRole('button', { name: 'Push hash' }));
  await waitFor(() =>
    expect(window.history.state).toMatchObject({ tree: 'DOCUMENTS', oneasterNavigationIndex: 1 }),
  );
  expect(window.location.hash).toBe('#details');
  expect(screen.getByLabelText('Pending target')).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole('button', { name: 'Replace hash' }));
  expect(window.location.hash).toBe('#summary');
  expect(window.history.length).toBe(length + 1);
  expect(route.push).not.toHaveBeenCalled();
});

it.each([
  'https://example.invalid',
  '//example.invalid',
  '/safe\\unsafe',
  '/space here',
  '/line\nfeed',
  '',
])('unsafe href %s is rejected', (href) => {
  expect(safeAppHref(href)).toBe(false);
});

function MissingProvider() {
  useAppNavigation();
  return null;
}

it('navigation hooks reject usage outside their scoped provider', () => {
  const report = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<MissingProvider />)).toThrow('AppNavigationProvider is required');
  report.mockRestore();
});

it('router failures announce recovery without retaining a stuck progress bar', () => {
  route.push.mockImplementationOnce(() => {
    throw new Error('private transport detail');
  });
  fixture();
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Push draft' }));
  });
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent(
    'Page navigation failed. Try again.',
  );
  expect(screen.queryByText('private transport detail')).not.toBeInTheDocument();
});
