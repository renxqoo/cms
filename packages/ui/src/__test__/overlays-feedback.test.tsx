import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { expect, it, vi } from 'vitest';
import { Button } from '../actions.tsx';
import {
  CopyButton,
  ErrorPill,
  LoadingIndicator,
  LoadingProvider,
  Progress,
  ToastProvider,
  useLoading,
  useToast,
} from '../feedback.tsx';
import { Field, Input } from '../forms.tsx';
import {
  ConfirmDialog,
  Drawer,
  FormDialog,
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
} from '../overlays.tsx';
import type { AsyncResult } from '../overlays.tsx';

it('opens a labelled popover and restores focus after closing it', async () => {
  const user = userEvent.setup();
  render(
    <Popover>
      <PopoverTrigger render={<Button>Open metadata</Button>} />
      <PopoverContent side="top" align="center">
        <PopoverTitle>Metadata</PopoverTitle>
        <PopoverDescription>Document information</PopoverDescription>
        <PopoverClose render={<Button>Done</Button>} />
      </PopoverContent>
    </Popover>,
  );
  await user.click(screen.getByRole('button', { name: 'Open metadata' }));
  expect(screen.getByRole('dialog', { name: 'Metadata' })).toHaveAccessibleDescription(
    'Document information',
  );
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Open metadata' })).toHaveFocus();
});

it('groups contextual menu actions, prevents disabled actions and supports a destructive choice', async () => {
  const disabled = vi.fn<() => void>();
  const remove = vi.fn<() => void>();
  const user = userEvent.setup();
  render(
    <Menu>
      <MenuTrigger render={<Button>Actions</Button>} />
      <MenuContent>
        <MenuGroup>
          <MenuLabel>Document</MenuLabel>
          <MenuItem disabled onClick={disabled}>
            Unavailable action
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem tone="destructive" onClick={remove}>
          Delete document
        </MenuItem>
      </MenuContent>
    </Menu>,
  );
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  expect(await screen.findByRole('menu')).toHaveTextContent('Document');
  fireEvent.click(screen.getByRole('menuitem', { name: 'Unavailable action' }));
  expect(disabled).not.toHaveBeenCalled();
  await user.click(screen.getByRole('menuitem', { name: 'Delete document' }));
  expect(remove).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
});

it('shows tooltip content on focus and dismisses it with Escape', async () => {
  const user = userEvent.setup();
  render(
    <Tooltip trigger={<Button>Details</Button>} delayMs={0}>
      Additional information
    </Tooltip>,
  );
  await user.tab();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('Additional information');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});

function DrawerExample({ side }: { side: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      side={side}
      title="Edit related document"
      description="Related document details"
      closeLabel="Close drawer"
      trigger={<Button>Open drawer</Button>}
    >
      <Input aria-label="Related title" />
    </Drawer>
  );
}

it.each(['left', 'right'] as const)(
  'keeps %s drawer keyboard focus and returns it to the trigger',
  async (side) => {
    const user = userEvent.setup();
    render(<DrawerExample side={side} />);
    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Edit related document');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open drawer' })).toHaveFocus();
  },
);

it('uses the shared form result contract for confirmation failures and successful retry', async () => {
  const confirm = vi
    .fn<(input: { signal: AbortSignal }) => Promise<AsyncResult>>()
    .mockResolvedValueOnce({ status: 'error', message: 'Try again later' })
    .mockResolvedValueOnce({ status: 'success' });
  const change = vi.fn<(open: boolean) => void>();
  const user = userEvent.setup();
  render(
    <ConfirmDialog
      open
      onOpenChange={change}
      title="Remove item?"
      closeLabel="Close"
      cancelLabel="Cancel"
      submitLabel="Remove"
      errorLabel="Failed"
      tone="destructive"
      onConfirm={confirm}
    >
      This removes the item.
    </ConfirmDialog>,
  );
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Try again later');
  expect(change).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(false));
});

it('copies exact text and reports both success and rejected clipboard feedback', async () => {
  const user = userEvent.setup();
  const copy = vi
    .fn<(value: string) => Promise<void>>()
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('Permission denied'));
  render(
    <CopyButton
      value="Document ID"
      label="Copy ID"
      copiedLabel="Copied"
      errorLabel="Copy unavailable"
      feedbackDurationMs={1000}
      writeText={copy}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Copy ID' }));
  expect(copy).toHaveBeenCalledWith('Document ID');
  expect(await screen.findByRole('status')).toHaveTextContent('Copied');
  await user.click(screen.getByRole('button', { name: 'Copy ID' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Copy unavailable');
});

it('uses the browser clipboard and clears feedback after its configured duration', async () => {
  const user = userEvent.setup();
  render(
    <CopyButton
      value="Alpha"
      label="Copy"
      copiedLabel="Copied"
      errorLabel="Failed"
      feedbackDurationMs={20}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await navigator.clipboard.readText()).toBe('Alpha');
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
});

it('ignores clipboard completion after unmount and never schedules feedback', async () => {
  let finish: (() => void) | undefined;
  const user = userEvent.setup();
  const view = render(
    <CopyButton
      value="Alpha"
      label="Copy"
      copiedLabel="Copied"
      errorLabel="Failed"
      feedbackDurationMs={20}
      writeText={() =>
        new Promise((resolve) => {
          finish = resolve;
        })
      }
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Copy' }));
  view.unmount();
  await act(async () => {
    finish?.();
    await Promise.resolve();
  });
  expect(screen.queryByText('Copied')).not.toBeInTheDocument();
});

function LoadingControls({ label }: { label: string }) {
  const loading = useLoading();
  const releases = useRef<(() => void)[]>([]);
  return (
    <>
      <Button
        onClick={() => {
          releases.current.push(loading.begin('upload'));
        }}
      >
        Start {label}
      </Button>
      <Button
        onClick={() => {
          releases.current[0]?.();
          releases.current[0]?.();
        }}
      >
        Finish {label}
      </Button>
      <span aria-label={`Count ${label}`}>{loading.count}</span>
      <span aria-label={`Sources ${label}`}>{loading.sources.join(',')}</span>
      <LoadingIndicator label={`Loading ${label}`} />
    </>
  );
}

it('tracks concurrent loading sources per provider and makes release idempotent', async () => {
  const user = userEvent.setup();
  render(
    <>
      <LoadingProvider>
        <LoadingControls label="A" />
      </LoadingProvider>
      <LoadingProvider>
        <LoadingControls label="B" />
      </LoadingProvider>
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Start A' }));
  await user.click(screen.getByRole('button', { name: 'Start A' }));
  expect(screen.getByLabelText('Count A')).toHaveTextContent('2');
  expect(screen.getByLabelText('Count B')).toHaveTextContent('0');
  expect(screen.getByLabelText('Sources A')).toHaveTextContent('upload,upload');
  await user.click(screen.getByRole('button', { name: 'Finish A' }));
  expect(screen.getByLabelText('Count A')).toHaveTextContent('1');
  expect(screen.getByRole('status', { name: 'Loading A' })).toBeVisible();
});

function TrackedForm({
  submit,
}: {
  submit: (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <LoadingProvider>
      <LoadingControls label="form" />
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="New item"
        loadingSource="form"
        closeLabel="Close"
        cancelLabel="Cancel"
        submitLabel="Save"
        errorLabel="Failed"
        onSubmit={submit}
      >
        <Field id="name" label="Name">
          <Input />
        </Field>
      </FormDialog>
    </LoadingProvider>
  );
}

it('holds a shared loading task for the full form operation and releases it on cancellation', async () => {
  const user = userEvent.setup();
  let signal: AbortSignal | undefined;
  render(
    <TrackedForm
      submit={({ signal: next }) => {
        signal = next;
        return new Promise((resolve) => {
          next.addEventListener('abort', () => resolve({ status: 'error', message: 'Cancelled' }), {
            once: true,
          });
        });
      }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByLabelText('Count form')).toHaveTextContent('1');
  await user.keyboard('{Escape}');
  expect(signal?.aborted).toBe(true);
  expect(screen.getByLabelText('Count form')).toHaveTextContent('0');
});

it('shows bounded progress and actionable error counts', async () => {
  const click = vi.fn<() => void>();
  const view = render(
    <>
      <Progress value={35} max={100} label="Upload progress" valueLabel="35 percent" />
      <ErrorPill count={2} label="Two errors" onClick={click} />
    </>,
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '35 percent');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Two errors' }));
  expect(click).toHaveBeenCalledOnce();
  view.rerender(
    <>
      <Progress value={null} max={100} label="Working" />
      <ErrorPill count={0} label="No errors" />
    </>,
  );
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

function ToastControls({ message }: { message: string }) {
  const { notify, dismiss } = useToast();
  const id = useRef<string | number | null>(null);
  return (
    <>
      <Button
        onClick={() => {
          id.current = notify({ message, tone: 'success', durationMs: 10000 });
        }}
      >
        Notify {message}
      </Button>
      <Button
        onClick={() => {
          if (id.current !== null) dismiss(id.current);
        }}
      >
        Dismiss {message}
      </Button>
    </>
  );
}

it('isolates toast hosts and cleans up only its own notifications', async () => {
  const user = userEvent.setup();
  const view = render(
    <>
      <ToastProvider label="Notices A" theme="light" closeLabel="Close notice">
        <ToastControls message="Alpha saved" />
      </ToastProvider>
      <ToastProvider label="Notices B" theme="dark" closeLabel="Close notice">
        <ToastControls message="Beta saved" />
      </ToastProvider>
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Notify Alpha saved' }));
  await user.click(screen.getByRole('button', { name: 'Notify Beta saved' }));
  expect(await screen.findByText('Alpha saved')).toBeVisible();
  expect(await screen.findByText('Beta saved')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Dismiss Alpha saved' }));
  await waitFor(() => expect(screen.queryByText('Alpha saved')).not.toBeInTheDocument());
  expect(screen.getByText('Beta saved')).toBeVisible();
  view.unmount();
});

it('does not show stale clipboard feedback after the copied value changes', async () => {
  let finish: (() => void) | undefined;
  const user = userEvent.setup();
  const props = {
    label: 'Copy',
    copiedLabel: 'Copied',
    errorLabel: 'Failed',
    feedbackDurationMs: 1000,
    writeText: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  };
  const view = render(<CopyButton {...props} value="Old value" />);
  await user.click(screen.getByRole('button', { name: 'Copy' }));
  view.rerender(<CopyButton {...props} value="New value" />);
  await act(async () => {
    finish?.();
    await Promise.resolve();
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
});

function MissingLoadingProvider() {
  useLoading();
  return null;
}

function MissingToastProvider() {
  useToast();
  return null;
}

it('rejects loading and toast consumers without their instance providers', () => {
  expect(() => render(<MissingLoadingProvider />)).toThrow('LoadingProvider is required');
  expect(() => render(<MissingToastProvider />)).toThrow('ToastProvider is required');
});

function ClosingToast() {
  const { notify, dismiss } = useToast();
  return (
    <>
      <Button
        onClick={() => {
          notify({ message: 'Plain notice', durationMs: 20 });
        }}
      >
        Plain
      </Button>
      <Button
        onClick={() => {
          notify({ message: 'Warning notice', tone: 'warning', durationMs: 1000 });
        }}
      >
        Warning
      </Button>
      <Button
        onClick={() => {
          notify({ message: 'Error notice', tone: 'error', durationMs: 1000 });
        }}
      >
        Error
      </Button>
      <Button onClick={() => dismiss('unowned')}>Ignore unrelated</Button>
    </>
  );
}

it('expires default notices and supplies a labelled close action for contextual toasts', async () => {
  const user = userEvent.setup();
  render(
    <ToastProvider label="Notifications" theme="light" closeLabel="Close notification">
      <ClosingToast />
    </ToastProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Plain' }));
  await screen.findByText('Plain notice');
  await waitFor(() => expect(screen.queryByText('Plain notice')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Warning' }));
  expect(await screen.findByText('Warning notice')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Close notification' }));
  await waitFor(() => expect(screen.queryByText('Warning notice')).not.toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Error' }));
  expect(await screen.findByText('Error notice')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Ignore unrelated' }));
  expect(screen.getByText('Error notice')).toBeVisible();
});
