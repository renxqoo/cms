import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import type { FolderTree } from '../../../contracts/content';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { createNavigationController } from '../../../components/shell/navigation/controller';
import { FolderManager } from '../folder-manager';
import { contentMessages } from '../content-messages';
import { time } from './support';
interface Call {
  operation: string;
  body?: unknown;
  query?: unknown;
  params?: Readonly<Record<string, string>>;
  idempotencyKey?: string;
  signal: AbortSignal;
}
const controls = vi.hoisted(() => ({
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  request: vi.fn<(input: Call) => Promise<ApiResult<unknown>>>(),
  denied: new Set<string>(),
  navigation: null as ReturnType<typeof createNavigationController> | null,
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    can: (operation: string) => !controls.denied.has(operation),
    reportResult: controls.report,
  }),
}));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => ({
    adapter: controls.navigation?.adapter,
    push: () => {},
    replace: () => {},
  }),
}));
const folderId = '50000000-0000-4000-8000-000000000001';
function folder(name = 'Original', version = 1, parentId: string | null = null): FolderTree {
  return { id: folderId, name, version, parentId, createdAt: time, updatedAt: time, children: [] };
}
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: 'directory', data };
}
beforeEach(() => {
  controls.denied = new Set();
  controls.navigation = createNavigationController('/dashboard/collections/articles');
});
afterEach(() => {
  cleanup();
  controls.navigation?.dispose();
  vi.resetAllMocks();
});
function element() {
  return (
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <FolderManager collection="articles" messages={contentMessages.en} />
    </ShellProvider>
  );
}
function view() {
  return render(element());
}
async function submit(deleting = false) {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit folder' }));
  const dialog = screen.getByRole('dialog', { name: 'Edit folder' });
  if (deleting) fireEvent.click(within(dialog).getByRole('button', { name: 'Delete folder' }));
  else
    fireEvent.change(within(dialog).getByRole('textbox', { name: /Name/ }), {
      target: { value: 'Renamed' },
    });
  const buttons = within(dialog).getAllByRole('button', {
    name: deleting ? 'Delete folder' : 'Save',
  });
  const button = buttons.at(-1);
  if (!button) throw new Error('Missing submit');
  fireEvent.click(button);
  return dialog;
}
it.each(['update', 'delete'] as const)(
  'regression: an unknown folder %s can be verified by a fresh complete directory without repeating the CAS write',
  async (kind) => {
    let rows = [folder()];
    controls.request.mockImplementation((input) => {
      if (input.operation === `folders.${kind}`) {
        rows = kind === 'delete' ? [] : [folder('Renamed', 2)];
        return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
      }
      return Promise.resolve(ok({ rows }));
    });
    view();
    const dialog = await submit(kind === 'delete');
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
    );
    await waitFor(() =>
      expect(
        controls.request.mock.calls.filter(([input]) => input.operation === 'folders.list').length,
      ).toBeGreaterThan(1),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      controls.request.mock.calls.filter(([input]) => input.operation === `folders.${kind}`),
    ).toHaveLength(1);
  },
);
it.each([
  { name: 'Renamed', version: 1, parentId: null },
  { name: 'Different', version: 2, parentId: null },
  { name: 'Renamed', version: 3, parentId: null },
  { name: 'Renamed', version: 2, parentId: '50000000-0000-4000-8000-000000000002' },
])(
  'does not confirm a submitted update from the mismatching fresh folder %j',
  async (observation) => {
    let written = false;
    controls.request.mockImplementation((input) => {
      if (input.operation === 'folders.update') {
        written = true;
        return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
      }
      return Promise.resolve(
        ok({
          rows: [
            written
              ? folder(observation.name, observation.version, observation.parentId)
              : folder(),
          ],
        }),
      );
    });
    view();
    const dialog = await submit();
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
    );
    await within(dialog).findByText(
      'The latest directory does not confirm the submitted operation. Your draft and original version are preserved.',
    );
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('Renamed');
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toBeDisabled();
    expect(
      controls.request.mock.calls.filter(([input]) => input.operation === 'folders.update'),
    ).toHaveLength(1);
  },
);
it('permits an explicitly confirmed exit after an unchanged unknown result without calling it cancellation or repeating the write', async () => {
  controls.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'folders.update'
        ? failure('request_failed', 0, { uncertain: true })
        : ok({ rows: [folder()] }),
    ),
  );
  view();
  const dialog = await submit();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await within(dialog).findByText(
    'The latest directory does not confirm the submitted operation. Your draft and original version are preserved.',
  );
  expect(
    within(dialog).queryByRole('button', { name: 'Continue editing with current revision' }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close with result unconfirmed' }));
  expect(dialog).toHaveTextContent('closing does not cancel it');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
  expect(within(dialog).queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close with result unconfirmed' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(
    controls.request.mock.calls.filter(([input]) => input.operation === 'folders.update'),
  ).toHaveLength(1);
});
it('adopts only the explicitly chosen fresh conflicting version while preserving the name draft for the next CAS request', async () => {
  let writes = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.update') {
      writes += 1;
      return Promise.resolve(
        writes === 1 ? failure('request_failed', 0, { uncertain: true }) : ok(folder('Renamed', 6)),
      );
    }
    return Promise.resolve(ok({ rows: [writes ? folder('Remote name', 5) : folder()] }));
  });
  view();
  const dialog = await submit();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Continue editing with current revision' }),
  );
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('Renamed');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const calls = controls.request.mock.calls.filter(
    ([input]) => input.operation === 'folders.update',
  );
  expect(calls[1]?.[0]).toMatchObject({
    body: { collection: 'articles', version: 5, name: 'Renamed', parentId: null },
  });
  expect(calls[1]?.[0].idempotencyKey).toBeUndefined();
});
it('a directory read failure preserves the unknown write and permits another explicit read without another PATCH', async () => {
  let writes = 0;
  let verification = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.update') {
      writes += 1;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    if (writes) {
      verification += 1;
      if (verification === 1) return Promise.resolve(failure('backend_unavailable', 503));
    }
    return Promise.resolve(ok({ rows: [writes ? folder('Renamed', 2) : folder()] }));
  });
  view();
  const dialog = await submit();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await within(dialog).findByText(/The request could not be completed/);
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toBeDisabled();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(writes).toBe(1);
});
it('an absent fresh update target is not confused with successful deletion', async () => {
  let written = false;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.update') {
      written = true;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    return Promise.resolve(ok({ rows: written ? [] : [folder()] }));
  });
  view();
  const dialog = await submit();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await within(dialog).findByText('This folder is absent from the latest complete directory.');
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('Renamed');
  expect(
    within(dialog).queryByRole('button', { name: 'Continue editing with current revision' }),
  ).not.toBeInTheDocument();
});
it('unknown create replay keeps the original idempotency key and payload, and never infers success from another same-name folder', async () => {
  let writes = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.create') {
      writes += 1;
      return Promise.resolve(
        writes === 1 ? failure('request_failed', 0, { uncertain: true }) : ok(folder('Created', 1)),
      );
    }
    return Promise.resolve(ok({ rows: [folder('Created', 1)] }));
  });
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'Create folder' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Name/ }), {
    target: { value: 'Created' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const calls = controls.request.mock.calls.filter(
    ([input]) => input.operation === 'folders.create',
  );
  expect(calls).toHaveLength(2);
  expect(calls[1]?.[0].body).toEqual(calls[0]?.[0].body);
  expect(calls[1]?.[0].idempotencyKey).toBe(calls[0]?.[0].idempotencyKey);
});
it('revoking folder read access invalidates a previously fresh adoption snapshot until another authorized explicit read', async () => {
  let written = false;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.update') {
      written = true;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    return Promise.resolve(ok({ rows: [written ? folder('Remote', 5) : folder()] }));
  });
  const page = view();
  const dialog = await submit();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await within(dialog).findByRole('button', { name: 'Continue editing with current revision' });
  controls.denied.add('folders.list');
  page.rerender(element());
  await waitFor(() =>
    expect(
      within(dialog).queryByRole('button', { name: 'Continue editing with current revision' }),
    ).not.toBeInTheDocument(),
  );
  expect(
    within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
  ).toBeDisabled();
  controls.denied.clear();
  page.rerender(element());
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
    ).toBeEnabled(),
  );
  expect(
    within(dialog).queryByRole('button', { name: 'Continue editing with current revision' }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
  );
  expect(
    await within(dialog).findByRole('button', { name: 'Continue editing with current revision' }),
  ).toBeEnabled();
  controls.denied.add('folders.update');
  page.rerender(element());
  expect(
    within(dialog).getByRole('button', { name: 'Continue editing with current revision' }),
  ).toBeDisabled();
});
it('revoking folder reads aborts an in-flight verification and ignores its late response without unlocking the original write', async () => {
  let written = false;
  let blocked = true;
  let signal: AbortSignal | undefined;
  let resolve: ((value: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.update') {
      written = true;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    if (written && blocked) {
      ({ signal } = input);
      return new Promise((done) => {
        resolve = done;
      });
    }
    return Promise.resolve(ok({ rows: [written ? folder('Renamed', 2) : folder()] }));
  });
  const page = view();
  const dialog = await submit();
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await waitFor(() => expect(signal).toBeDefined());
  controls.denied.add('folders.list');
  page.rerender(element());
  expect(signal?.aborted).toBe(true);
  resolve?.(ok({ rows: [folder('Renamed', 2)] }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
    ).toBeDisabled(),
  );
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toBeDisabled();
  blocked = false;
  controls.denied.clear();
  page.rerender(element());
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('unmounting an unresolved directory verification cancels its read and discards the late response', async () => {
  let written = false;
  let signal: AbortSignal | undefined;
  let resolve: ((value: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.delete') {
      written = true;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    if (written) {
      ({ signal } = input);
      return new Promise((done) => {
        resolve = done;
      });
    }
    return Promise.resolve(ok({ rows: [folder()] }));
  });
  const page = view();
  const dialog = await submit(true);
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  await waitFor(() => expect(signal).toBeDefined());
  const reports = controls.report.mock.calls.length;
  page.unmount();
  expect(signal?.aborted).toBe(true);
  resolve?.(ok({ rows: [] }));
  await Promise.resolve();
  expect(controls.report).toHaveBeenCalledTimes(reports);
});
