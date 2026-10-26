import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ManagementTestProvider } from '../../../../../../test/support/admin-management';
import { ManagementDialog } from '../management-dialog';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/resources',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));

function nativeBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it('protects programmatic recipe changes and uncertain writes without requiring a form change event', () => {
  const close = vi.fn<() => void>();
  const submit = vi.fn<() => void>();
  function tree(input: { dirty: boolean; pending?: boolean; locked?: boolean }) {
    return (
      <ManagementTestProvider>
        <ManagementDialog open title="Image recipe" onClose={close} onSubmit={submit} {...input}>
          <button type="button">Apply crop</button>
        </ManagementDialog>
      </ManagementTestProvider>
    );
  }
  const { rerender, unmount } = render(tree({ dirty: false }));
  expect(nativeBlocked()).toBe(false);
  rerender(tree({ dirty: true }));
  expect(nativeBlocked()).toBe(true);
  rerender(tree({ dirty: false }));
  expect(nativeBlocked()).toBe(false);
  rerender(tree({ dirty: false, pending: true }));
  expect(nativeBlocked()).toBe(true);
  rerender(tree({ dirty: false, locked: true }));
  expect(nativeBlocked()).toBe(true);
  unmount();
  expect(nativeBlocked()).toBe(false);
});
