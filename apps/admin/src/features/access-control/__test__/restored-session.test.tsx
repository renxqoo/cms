import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@new-cms/ui/overlays';
import { RestoredSessionBoundary } from '../restored-session';

const mock = vi.hoisted(() => ({ reload: vi.fn<() => void>() }));
vi.mock('../session-navigation', () => ({ reloadRestoredSession: mock.reload }));
afterEach(() => vi.resetAllMocks());

it('hides and disables private content before a persisted page can be restored and revalidates the document', () => {
  const view = render(
    <RestoredSessionBoundary>
      <p>Private identity</p>
    </RestoredSessionBoundary>,
  );
  const surface = document.body;
  fireEvent(window, new PageTransitionEvent('pagehide', { persisted: false }));
  expect(surface).toHaveStyle({ visibility: 'visible' });
  fireEvent(window, new PageTransitionEvent('pagehide', { persisted: true }));
  expect(surface).toHaveStyle({ visibility: 'hidden' });
  expect(surface).toHaveProperty('inert', true);
  fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
  expect(mock.reload).toHaveBeenCalledOnce();
  view.unmount();
  expect(surface.style.visibility).toBe('');
  expect(surface).not.toHaveProperty('inert', true);
  fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }));
  expect(mock.reload).toHaveBeenCalledOnce();
});

it('does not reload an ordinary page show', () => {
  render(<RestoredSessionBoundary>Content</RestoredSessionBoundary>);
  fireEvent(window, new PageTransitionEvent('pageshow', { persisted: false }));
  expect(mock.reload).not.toHaveBeenCalled();
});

it('regression: persisted page hiding also covers private dialog content rendered through a portal', async () => {
  render(
    <RestoredSessionBoundary>
      <Dialog open>
        <DialogContent closeLabel="Close">
          <DialogTitle>Private portal</DialogTitle>
          <DialogDescription>Account draft</DialogDescription>
        </DialogContent>
      </Dialog>
    </RestoredSessionBoundary>,
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent(window, new PageTransitionEvent('pagehide', { persisted: true }));
  expect(dialog).not.toBeVisible();
});
