import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { Me } from '../../../contracts/auth';
import type { AccessData } from '../load-access';
import { AccessProvider, useAccessControl } from '../provider';

const mock = vi.hoisted(() => ({
  load: vi.fn<(signal: AbortSignal) => Promise<ApiResult<AccessData>>>(),
  navigate: vi.fn<() => void>(),
}));
vi.mock('../load-access', () => ({ loadAccess: mock.load }));
vi.mock('../session-navigation', () => ({ replaceExpiredSession: mock.navigate }));
function principal(name: string, id = '11111111-1111-4111-8111-111111111111'): Me {
  return {
    id,
    version: 1,
    email: `${name}@example.test`,
    displayName: name,
    roleId: '22222222-2222-4222-8222-222222222222',
    roleCode: 'reader',
    status: 'active',
    activation: 'activated',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    lastLoginAt: null,
    role: {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'reader',
      name: 'Reader',
      status: 'active',
      isSuper: false,
    },
  };
}
function ready(): ApiResult<AccessData> {
  return {
    ok: true,
    status: 200,
    requestId: '',
    data: {
      operations: [{ operationId: 'admins.list', scopeKind: 'global', collectionKey: null }],
      navigation: [],
    },
  };
}
function Consumer() {
  const access = useAccessControl();
  const [draft, setDraft] = useState('');
  return (
    <>
      <output>
        {access.principal.displayName}:{access.phase}:{String(access.can('admins.list'))}
      </output>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button onClick={access.refresh}>Refresh</button>
      <button onClick={() => access.reportResult(failure('forbidden', 403))}>Forbidden</button>
    </>
  );
}
afterEach(() => vi.resetAllMocks());

it('finishes a StrictMode lifecycle restart instead of leaving the provider permanently disposed', async () => {
  mock.load.mockResolvedValue(ready());
  render(
    <StrictMode>
      <AccessProvider principal={principal('owner')}>
        <Consumer />
      </AccessProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('owner:ready:true'));
  expect(mock.load).toHaveBeenCalledTimes(2);
});

it('publishes new principal props without resetting a same-identity local draft', async () => {
  mock.load.mockResolvedValue(ready());
  const view = render(
    <AccessProvider principal={principal('before')}>
      <Consumer />
    </AccessProvider>,
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('before:ready:true'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
    target: { value: 'retained' },
  });
  view.rerender(
    <AccessProvider principal={{ ...principal('after'), version: 2 }}>
      <Consumer />
    </AccessProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('after:ready:true');
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('retained');
  expect(mock.load).toHaveBeenCalledOnce();
});

it('remounts the whole state scope across identities and ignores the previous identity late result', async () => {
  let old: ((result: ApiResult<AccessData>) => void) | undefined;
  mock.load
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          old = done;
        }),
    )
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      requestId: '',
      data: { operations: [], navigation: [] },
    });
  const view = render(
    <AccessProvider principal={principal('first')}>
      <Consumer />
    </AccessProvider>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
    target: { value: 'private first draft' },
  });
  view.rerender(
    <AccessProvider principal={principal('second', '33333333-3333-4333-8333-333333333333')}>
      <Consumer />
    </AccessProvider>,
  );
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('second:ready:false'));
  await act(async () => {
    old?.(ready());
    await Promise.resolve();
  });
  expect(screen.getByRole('status')).toHaveTextContent('second:ready:false');
});

it('refreshes through the context action and navigates only for confirmed unauthentication', async () => {
  mock.load.mockResolvedValueOnce(ready()).mockResolvedValueOnce(failure('unauthenticated', 401));
  render(
    <AccessProvider principal={principal('owner')}>
      <Consumer />
    </AccessProvider>,
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('owner:ready:true'));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(mock.navigate).toHaveBeenCalledOnce());
  expect(screen.getByRole('status')).toHaveTextContent('owner:failed:false');
});

it('rejects a consumer outside its request-scoped provider', () => {
  expect(() => render(<Consumer />)).toThrow('AccessProvider is required');
});

it('regression: a same-user role-status refresh preserves local drafts while withdrawing old permissions', async () => {
  mock.load.mockResolvedValueOnce(ready()).mockResolvedValueOnce({
    ok: true,
    status: 200,
    requestId: '',
    data: { operations: [], navigation: [] },
  });
  const owner = principal('owner');
  const view = render(
    <AccessProvider principal={owner}>
      <Consumer />
    </AccessProvider>,
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('owner:ready:true'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), {
    target: { value: 'Retained local draft' },
  });
  view.rerender(
    <AccessProvider principal={{ ...owner, role: { ...owner.role, status: 'disabled' } }}>
      <Consumer />
    </AccessProvider>,
  );
  expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Retained local draft');
  expect(screen.getByRole('status')).toHaveTextContent('owner:loading:false');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('owner:ready:false'));
});
