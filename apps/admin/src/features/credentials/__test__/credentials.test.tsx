import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { CreateKeyDialog } from '../create-key-dialog';
import { CredentialsPage } from '../credentials-page';
import { ResourcePermissionEditor } from '../resource-permission-editor';
import { articleCollection, articleRead, credential, systemRead } from './credential-fixtures';

const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        params?: Record<string, string>;
        query?: Record<string, unknown>;
        body?: unknown;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  refresh: vi.fn<() => void>(),
}));
const access = {
  phase: 'ready',
  operations: [articleRead, systemRead],
  reportResult: controls.report,
  refresh: controls.refresh,
  error: null,
};
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({ useAccessControl: () => access }));

function success<T>(data: T): ApiResult<T> {
  return { ok: true, status: 200, data, requestId: '' };
}
function list(rows = [credential], page = 1, total = rows.length) {
  return success({ rows, total, page, pageSize: 20 });
}
function view(children: React.ReactNode, locale: 'zh' | 'en' = 'en') {
  return render(<ShellProvider initial={parsePreferences({ locale })}>{children}</ShellProvider>);
}
function createView() {
  const close = vi.fn<() => void>();
  const rendered = view(<CreateKeyDialog onClose={close} />);
  return { close, ...rendered };
}
async function fillKey() {
  await screen.findByRole('checkbox', { name: 'Articles: documents.get' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Reader device' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Articles: documents.get' }));
}
function submitKey() {
  fireEvent.submit(screen.getByRole('form', { name: 'Create API key' }));
}

beforeEach(() => {
  controls.request.mockImplementation((input) => {
    if (input.operation === 'collections.list')
      return Promise.resolve(success({ rows: [articleCollection] }));
    if (input.operation === 'credentials.list') return Promise.resolve(list());
    return Promise.resolve(success({ credential, apiKey: 'cms_key_one_time_secret' }));
  });
});
afterEach(() => vi.resetAllMocks());

it('selects exact collection tuples and keeps selections when the resource search changes', async () => {
  const changed = vi.fn<(value: unknown) => void>();
  const rendered = view(
    <ResourcePermissionEditor
      grants={[articleRead, systemRead]}
      collections={[articleCollection]}
      value={[]}
      onChange={changed}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByText('documents.get', { exact: true }));
  expect(changed).toHaveBeenCalledWith([articleRead]);
  rendered.rerender(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <ResourcePermissionEditor
        grants={[articleRead, systemRead]}
        collections={[articleCollection]}
        value={[articleRead]}
        onChange={changed}
      />
    </ShellProvider>,
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Search resources or operations' }),
    'admins',
  );
  expect(
    screen.queryByRole('checkbox', { name: 'Articles: documents.get' }),
  ).not.toBeInTheDocument();
  expect(screen.getByText('Selected: 1')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'admins: admins.list' }));
  expect(changed).toHaveBeenLastCalledWith([articleRead, systemRead]);
});

it('validates name, expiry and grants before creating a key and focuses the first invalid input', async () => {
  createView();
  await screen.findByRole('checkbox', { name: 'Articles: documents.get' });
  submitKey();
  expect(screen.getByText('Enter a name with no more than 80 characters.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  expect(
    screen.getByText('Select at least one available resource permission.'),
  ).toBeInTheDocument();
  await fillKey();
  fireEvent.change(screen.getByLabelText(/^Expires at/), { target: { value: '2020-01-01T12:00' } });
  submitKey();
  expect(screen.getByText('Choose an expiry within the next 90 days.')).toBeInTheDocument();
  expect(
    controls.request.mock.calls.every(([input]) => input.operation === 'collections.list'),
  ).toBe(true);
});

it('creates a key once with only explicitly selected grants and displays its secret only in that dialog', async () => {
  view(<CredentialsPage />);
  await screen.findByText('Article reader');
  fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
  await fillKey();
  submitKey();
  expect(await screen.findByRole('heading', { name: 'Save your API key' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'API key secret' })).toHaveValue(
    'cms_key_one_time_secret',
  );
  expect(
    controls.request.mock.calls.find(([input]) => input.operation === 'credentials.createKey')?.[0]
      .body,
  ).toMatchObject({ name: 'Reader device', grants: [articleRead] });
  fireEvent.click(screen.getByRole('button', { name: 'I saved it, close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByDisplayValue('cms_key_one_time_secret')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
  await screen.findByRole('textbox', { name: 'Name' });
  expect(screen.queryByRole('textbox', { name: 'API key secret' })).not.toBeInTheDocument();
});

it('locks an uncertain creation without replaying the write and preserves the entered name', async () => {
  controls.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'collections.list'
        ? success({ rows: [articleCollection] })
        : failure('request_failed', 0, { uncertain: true }),
    ),
  );
  createView();
  await fillKey();
  submitKey();
  expect(
    await screen.findByText(/If a key was created without receiving its secret/),
  ).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Reader device');
  submitKey();
  expect(
    controls.request.mock.calls.filter(([input]) => input.operation === 'credentials.createKey'),
  ).toHaveLength(1);
});

it('cancels creation, ignores a late secret and aborts every request on unmount', async () => {
  let complete: ((result: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation((input) =>
    input.operation === 'collections.list'
      ? Promise.resolve(success({ rows: [articleCollection] }))
      : new Promise((resolve) => {
          complete = resolve;
        }),
  );
  const rendered = createView();
  await fillKey();
  submitKey();
  submitKey();
  expect(
    controls.request.mock.calls.filter(([input]) => input.operation === 'credentials.createKey'),
  ).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
  await act(async () => {
    complete?.(success({ credential, apiKey: 'late-secret' }));
    await Promise.resolve();
  });
  expect(screen.queryByDisplayValue('late-secret')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create API key' })).toBeDisabled();
  rendered.unmount();
  expect(controls.request.mock.calls.every(([input]) => input.signal.aborted)).toBe(true);
});

it('preserves a failed creation for explicit retry and localizes field errors without echoing server content', async () => {
  controls.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'collections.list'
        ? success({ rows: [articleCollection] })
        : {
            ...failure('invalid_input', 400),
            error: {
              code: 'invalid_input',
              requestId: '',
              message: 'server-secret',
              fieldErrors: [{ field: 'expiresAt', message: 'server-secret' }],
            },
          },
    ),
  );
  createView();
  await fillKey();
  submitKey();
  await screen.findByText('Check the entered values and field requirements.');
  expect(
    screen.getAllByText('Up to 90 days. A child credential cannot outlive its parent.'),
  ).toHaveLength(2);
  expect(screen.queryByText('server-secret')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create API key' })).toBeEnabled();
});

it('requires a confirmation to revoke a key and refreshes the server status after success', async () => {
  let revoked = false;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'credentials.revoke') {
      revoked = true;
      return Promise.resolve({ ok: true, status: 204, data: undefined, requestId: '' });
    }
    return Promise.resolve(list([{ ...credential, status: revoked ? 'revoked' : 'active' }]));
  });
  view(<CredentialsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
  expect(
    controls.request.mock.calls.some(([input]) => input.operation === 'credentials.revoke'),
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  expect(await screen.findByText('Access revoked.')).toBeInTheDocument();
  expect(await screen.findByText('Revoked', { exact: true })).toBeInTheDocument();
  expect(
    controls.request.mock.calls.find(([input]) => input.operation === 'credentials.revoke')?.[0]
      .params,
  ).toEqual({ id: credential.id });
});

it('switches tabs by keyboard and distinguishes one OAuth sign-in from all sign-ins of its application', async () => {
  controls.request.mockImplementation((input) => {
    if (input.operation === 'credentials.list')
      return Promise.resolve(
        list(
          input.query?.kind === 'oauth'
            ? [{ ...credential, kind: 'oauth', clientId: 'cms-cli', clientName: 'CMS CLI' }]
            : [],
        ),
      );
    return Promise.resolve(success({ revoked: 2 }));
  });
  view(<CredentialsPage />);
  const keys = screen.getByRole('tab', { name: 'API keys' });
  keys.focus();
  fireEvent.keyDown(keys, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'OAuth sign-ins' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'OAuth sign-ins' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke this sign-in' }));
  await userEvent.setup().keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Revoke all sign-ins for this application' }));
  expect(screen.getByText(/Sign-ins for other applications stay active/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  await screen.findByText('Access revoked.');
  expect(
    controls.request.mock.calls.find(
      ([input]) => input.operation === 'credentials.revokeClient',
    )?.[0].params,
  ).toEqual({ clientId: 'cms-cli' });
});

it('requests pagination from the server and never infers statuses from the local clock', async () => {
  controls.request.mockImplementation((input) =>
    Promise.resolve(
      list(
        [{ ...credential, expiresAt: '2020-01-01T00:00:00.000Z', status: 'active' }],
        Number(input.query?.page ?? 1),
        21,
      ),
    ),
  );
  view(<CredentialsPage />);
  await screen.findByText('Active', { exact: true });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(controls.request.mock.calls.at(-1)?.[0].query).toMatchObject({
      page: 2,
      pageSize: 20,
      kind: 'api_key',
    }),
  );
});

it('renders Chinese permission labels and supports Escape closing without sending a write', async () => {
  const close = vi.fn<() => void>();
  view(<CreateKeyDialog onClose={close} />, 'zh');
  await screen.findByRole('checkbox', { name: 'Articles: documents.get' });
  expect(screen.getByText('资源权限')).toBeInTheDocument();
  await userEvent.setup().keyboard('{Escape}');
  expect(close).toHaveBeenCalledOnce();
  expect(
    controls.request.mock.calls.every(([input]) => input.operation === 'collections.list'),
  ).toBe(true);
});

it('keeps a failed revocation visible and allows an explicit idempotent retry', async () => {
  let attempts = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'credentials.revoke') {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? failure('forbidden', 403)
          : { ok: true, status: 204, data: undefined, requestId: '' },
      );
    }
    return Promise.resolve(list());
  });
  view(<CredentialsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke key' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  expect(await screen.findByText(/Your account cannot perform this operation/)).toBeInTheDocument();
  expect(screen.queryByText('Access revoked.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
  expect(await screen.findByText('Access revoked.')).toBeInTheDocument();
  expect(attempts).toBe(2);
});

it('renders the server expired status and last-used timestamp while a failed list can be refreshed', async () => {
  controls.request
    .mockResolvedValueOnce(failure('backend_unavailable', 503))
    .mockResolvedValue(
      list([{ ...credential, status: 'expired', lastUsedAt: '2026-10-27T10:30:00.000Z' }]),
    );
  view(<CredentialsPage />);
  await screen.findByText('The credential list could not be loaded. Try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Expired', { exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Revoke key' })).toBeDisabled();
  expect(screen.queryByText('Not used yet')).not.toBeInTheDocument();
});

it('retries a failed collection catalogue without creating a key from partial permission data', async () => {
  controls.request
    .mockResolvedValueOnce(failure('backend_unavailable', 503))
    .mockResolvedValue(success({ rows: [articleCollection] }));
  createView();
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await fillKey();
  expect(screen.getByRole('button', { name: 'Create API key' })).toBeEnabled();
  expect(
    controls.request.mock.calls.every(([input]) => input.operation === 'collections.list'),
  ).toBe(true);
});

it('regression: allows a document permission even when the account cannot read collection metadata', async () => {
  const original = controls.request.getMockImplementation();
  controls.request.mockImplementation((input) =>
    input.operation === 'collections.list'
      ? Promise.resolve(success({ rows: [] }))
      : original
        ? original(input)
        : Promise.resolve(failure('invalid_response', 0)),
  );
  createView();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'articles: documents.get' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Limited agent' },
  });
  submitKey();
  await screen.findByRole('heading', { name: 'Save your API key' });
  expect(
    controls.request.mock.calls.find(([input]) => input.operation === 'credentials.createKey')?.[0]
      .body,
  ).toMatchObject({ grants: [articleRead] });
});
