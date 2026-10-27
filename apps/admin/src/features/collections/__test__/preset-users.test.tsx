import { pageApi, resetPageApi, defaultPageRequest, ok, recordId, secondId } from './page-fixture';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';

import type { PageRequest } from './page-fixture';
import { PresetUsers } from '../preset-users';
import * as accessControl from '../../access-control/provider';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
beforeEach(resetPageApi);
afterEach(() => vi.restoreAllMocks());
it('searches authorized identities by name or email and saves the identity id while retaining existing values', async () => {
  const change = vi.fn<(ids: string[]) => void>();
  pageApi.request.mockImplementation((input) =>
    input.operation === 'admins.list'
      ? Promise.resolve(
          ok({
            rows: [
              { id: secondId, displayName: 'Alice', email: 'alice@example.com', status: 'active' },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
        )
      : defaultPageRequest(input),
  );
  renderManagement(
    <PresetUsers
      id="users"
      label="Authorized users"
      value={[recordId]}
      readOnly={false}
      change={change}
    />,
  );
  const input = screen.getByRole('combobox', { name: 'Authorized users' });
  await userEvent.click(input);
  const search = await within(
    await screen.findByRole('dialog', { name: 'Authorized users' }),
  ).findByRole('combobox', { name: 'Authorized users' });
  fireEvent.change(search, { target: { value: 'Alice' } });
  await userEvent.click(await screen.findByRole('option', { name: 'Alice · alice@example.com' }));
  expect(change).toHaveBeenCalledWith([recordId, secondId]);
  expect(
    pageApi.request.mock.calls.some(
      ([request]) => request.operation === 'admins.list' && request.query?.['q'] === 'Alice',
    ),
  ).toBe(true);
});
it('preserves known ids without reading the directory when admins.list is denied', () => {
  pageApi.denied.add('admins.list');
  const change = vi.fn<(ids: string[]) => void>();
  renderManagement(
    <PresetUsers
      id="users"
      label="Authorized users"
      value={[recordId]}
      readOnly={false}
      change={change}
    />,
  );
  expect(screen.getByLabelText('Authorized users')).toHaveValue(recordId);
  expect(screen.getByText(/directory is unavailable to your role/)).toBeVisible();
  fireEvent.change(screen.getByLabelText('Authorized users'), {
    target: { value: `${recordId}, ${secondId}` },
  });
  expect(change).toHaveBeenCalledWith([recordId, secondId]);
  expect(pageApi.request).not.toHaveBeenCalled();
});
it('cancels the identity search on actor replacement and never shows the previous actor response', async () => {
  const snapshot = accessControl.useAccessControl;
  let actor = recordId;
  vi.spyOn(accessControl, 'useAccessControl').mockImplementation(() => {
    const value = snapshot();
    return { ...value, principal: { ...value.principal, id: actor } };
  });
  let pending: PageRequest | undefined;
  let release: ((value: ApiResult<unknown>) => void) | undefined;
  pageApi.request.mockImplementation((input) => {
    pending = input;
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const view = renderManagement(
    <PresetUsers
      id="users"
      label="Authorized users"
      value={[]}
      readOnly={false}
      change={vi.fn<(...values: unknown[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Authorized users' }));
  await waitFor(() => expect(pending).toBeDefined());
  actor = secondId;
  view.rerender(
    <ManagementTestProvider>
      <PresetUsers
        id="users"
        label="Authorized users"
        value={[]}
        readOnly={false}
        change={vi.fn<(...values: unknown[]) => void>()}
      />
    </ManagementTestProvider>,
  );
  await waitFor(() => expect(pending?.signal?.aborted).toBe(true));
  await act(async () => {
    release?.(
      ok({
        rows: [
          {
            id: recordId,
            displayName: 'Previous actor private identity',
            email: 'old@example.com',
            status: 'active',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    );
    await Promise.resolve();
  });
  expect(screen.queryByText('Previous actor private identity · old@example.com')).toBeNull();
});

it('reports a denied directory search and never substitutes hidden identity details', async () => {
  pageApi.request.mockResolvedValue(failure('forbidden', 403));
  renderManagement(
    <PresetUsers
      id="users"
      label="Authorized users"
      value={[recordId]}
      readOnly={false}
      change={vi.fn<(ids: string[]) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Authorized users' }));
  await screen.findByText('Could not read the identity directory.');
  expect(pageApi.report).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(screen.queryByText('alice@example.com')).toBeNull();
});
