import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { UnsavedChangesGuard } from '../unsaved-changes';
import { createNavigationController } from '../../shell/navigation/controller';

afterEach(cleanup);
const labels = {
  title: 'Leave all edits?',
  description: 'Unsaved drafts will be lost.',
  confirm: 'Leave',
  cancel: 'Stay',
  close: 'Close',
};

it('aggregates a nested modal draft into one real navigation guard and one confirmation', () => {
  const controller = createNavigationController('/document');
  const subscribe = vi.spyOn(controller.adapter, 'subscribe');
  const execute = vi.fn<() => void>();
  const { unmount } = render(
    <UnsavedChangesGuard dirty={false} navigation={controller.adapter} labels={labels}>
      <UnsavedChangesGuard dirty navigation={controller.adapter} labels={labels}>
        <input aria-label="Modal draft" defaultValue="Keep this" />
      </UnsavedChangesGuard>
    </UnsavedChangesGuard>,
  );
  expect(subscribe).toHaveBeenCalledOnce();
  act(() => {
    controller.request({ href: '/other', kind: 'push' }, execute);
  });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^Stay$/ }));
  expect(screen.getByLabelText('Modal draft')).toHaveValue('Keep this');
  act(() => {
    controller.request({ href: '/other', kind: 'push' }, execute);
  });
  fireEvent.click(screen.getByRole('button', { name: /^Leave$/ }));
  expect(execute).toHaveBeenCalledOnce();
  unmount();
  expect(controller.hasGuard()).toBe(false);
});

it('removes only the unmounted child draft and releases native unload protection', () => {
  const controller = createNavigationController('/document');
  const execute = vi.fn<() => void>();
  const tree = (open: boolean) => (
    <UnsavedChangesGuard dirty={false} navigation={controller.adapter} labels={labels}>
      {open ? (
        <UnsavedChangesGuard dirty navigation={controller.adapter} labels={labels}>
          Modal
        </UnsavedChangesGuard>
      ) : null}
    </UnsavedChangesGuard>
  );
  const { rerender } = render(tree(true));
  const before = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(true);
  rerender(tree(false));
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
  act(() => {
    controller.request({ href: '/other', kind: 'push' }, execute);
  });
  expect(execute).toHaveBeenCalledOnce();
});

it('retains the outer document draft after a clean nested modal leaves', () => {
  const controller = createNavigationController('/document');
  const execute = vi.fn<() => void>();
  render(
    <UnsavedChangesGuard dirty navigation={controller.adapter} labels={labels}>
      <UnsavedChangesGuard dirty={false} navigation={controller.adapter} labels={labels}>
        Clean modal
      </UnsavedChangesGuard>
    </UnsavedChangesGuard>,
  );
  act(() => {
    controller.request({ href: '/other', kind: 'push' }, execute);
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(execute).not.toHaveBeenCalled();
});

it('keeps nested dirty changes operational through StrictMode effect replay', () => {
  const controller = createNavigationController('/document');
  const execute = vi.fn<() => void>();
  const tree = (dirty: boolean) => (
    <StrictMode>
      <UnsavedChangesGuard dirty={false} navigation={controller.adapter} labels={labels}>
        <UnsavedChangesGuard dirty={dirty} navigation={controller.adapter} labels={labels}>
          Modal
        </UnsavedChangesGuard>
      </UnsavedChangesGuard>
    </StrictMode>
  );
  const { rerender, unmount } = render(tree(false));
  rerender(tree(true));
  act(() => {
    controller.request({ href: '/other', kind: 'push' }, execute);
  });
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(execute).not.toHaveBeenCalled();
  unmount();
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  expect(controller.hasGuard()).toBe(false);
});

it('isolates different adapters while aggregating a repeated ancestor adapter through them', () => {
  const outer = createNavigationController('/document');
  const modal = createNavigationController('/modal');
  const leaveDocument = vi.fn<() => void>();
  const leaveModal = vi.fn<() => void>();
  const { unmount } = render(
    <UnsavedChangesGuard dirty={false} navigation={outer.adapter} labels={labels}>
      <UnsavedChangesGuard dirty={false} navigation={modal.adapter} labels={labels}>
        <UnsavedChangesGuard dirty navigation={outer.adapter} labels={labels}>
          Nested document edit
        </UnsavedChangesGuard>
      </UnsavedChangesGuard>
    </UnsavedChangesGuard>,
  );
  act(() => {
    modal.request({ href: '/modal-other', kind: 'push' }, leaveModal);
  });
  expect(leaveModal).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  act(() => {
    outer.request({ href: '/other', kind: 'push' }, leaveDocument);
  });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(leaveDocument).not.toHaveBeenCalled();
  unmount();
  expect(outer.hasGuard()).toBe(false);
  expect(modal.hasGuard()).toBe(false);
});
