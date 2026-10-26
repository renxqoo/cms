import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CleanupPage } from '../cleanup-page';
import {
  Harness,
  forbidden,
  json,
  requestUrl,
  resetUi,
  ui,
} from '../../../../test/support/admin-asset-ui';
import { first, page } from '../../../../test/support/admin-asset-data';

vi.mock('../../access-control/provider', async () => {
  const support = await import('../../../../test/support/admin-asset-ui');
  return { useAccessControl: support.access };
});
vi.mock('../../../components/shell/navigation/provider', async () => {
  const { ui: state } = await import('../../../../test/support/admin-asset-ui');
  return {
    useAppNavigation: () => ({ adapter: state.adapter, push: state.push, replace: state.replace }),
  };
});
vi.mock('next/navigation', async () => {
  const { ui: state } = await import('../../../../test/support/admin-asset-ui');
  return { useSearchParams: () => new URLSearchParams(state.search) };
});
const fetcher = vi.fn<typeof fetch>();
let accepted = false;
let unknown = false;
let denied = false;
const entry = {
  id: first,
  state: 'pending',
  blocked: true,
  attempts: 2,
  failureCode: 'temporarily_unavailable',
  retainUntil: '2030-01-01T00:00:00.000Z',
  writeDeadline: null,
  nextCleanupAt: '2026-10-26T00:05:00.000Z',
  createdAt: '2026-10-26T00:00:00.000Z',
};
function api(input: Parameters<typeof fetch>[0]) {
  const url = new URL(requestUrl(input), 'http://localhost');
  if (denied) return Promise.resolve(forbidden());
  if (url.pathname.endsWith('/retries')) {
    if (unknown) {
      unknown = false;
      return Promise.reject(new Error('Lost response'));
    }
    accepted = true;
    return Promise.resolve(
      json({ id: first, accepted: true, location: `/v1/asset-cleanups/${first}` }, 202),
    );
  }
  if (url.pathname.endsWith(`/asset-cleanups/${first}`))
    return Promise.resolve(json({ ...entry, blocked: !accepted }));
  if (url.pathname.endsWith('/asset-cleanups'))
    return Promise.resolve(
      json(
        page(accepted && url.searchParams.get('blocked') === 'true' ? [] : [entry], 21, {
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 20),
        }),
      ),
    );
  throw new Error(`Unexpected cleanup request: ${url.pathname}`);
}
beforeEach(() => {
  resetUi();
  accepted = false;
  unknown = false;
  denied = false;
  fetcher.mockReset().mockImplementation(api);
  vi.stubGlobal('fetch', fetcher);
});

it('lists the safe cleanup ledger and projects 202 as accepted rather than physical deletion', async () => {
  render(
    <Harness>
      <CleanupPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: first }));
  fireEvent.click(await screen.findByRole('button', { name: 'Request cleanup retry' }));
  const confirm = screen.getAllByRole('dialog').at(-1) ?? document.body;
  fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm' }));
  expect(
    await within(confirm).findByText(
      'The retry was accepted. Physical deletion has not been confirmed.',
    ),
  ).toBeVisible();
  expect(within(confirm).getByRole('button', { name: 'Confirm' })).toBeDisabled();
  expect(accepted).toBe(true);
  const write = fetcher.mock.calls.find(([input]) => requestUrl(input).endsWith('/retries'));
  expect(write?.[1]?.method).toBe('POST');
  expect(write?.[1]?.body).toBe('{}');
  expect(new Headers(write?.[1]?.headers).get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
  fireEvent.click(within(confirm).getAllByRole('button', { name: 'Close' })[0] ?? document.body);
  expect(await within(screen.getByRole('dialog')).findByText('Pending cleanup')).toBeVisible();
  expect(
    within(screen.getByRole('dialog')).queryByRole('button', { name: 'Request cleanup retry' }),
  ).not.toBeInTheDocument();
});
it('replays one cleanup retry intent after an unknown outcome instead of creating a new intent', async () => {
  unknown = true;
  render(
    <Harness>
      <CleanupPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: first }));
  fireEvent.click(await screen.findByRole('button', { name: 'Request cleanup retry' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continue checking' }));
  await screen.findByText('The retry was accepted. Physical deletion has not been confirmed.');
  const writes = fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/retries'));
  expect(writes).toHaveLength(2);
  expect(new Headers(writes[0]?.[1]?.headers).get('idempotency-key')).toBe(
    new Headers(writes[1]?.[1]?.headers).get('idempotency-key'),
  );
});
it('combines blocked/state filters with server pagination and reports retryable read failures', async () => {
  const view = render(
    <Harness locale="zh">
      <CleanupPage />
    </Harness>,
  );
  await screen.findByRole('button', { name: first });
  fireEvent.change(screen.getByRole('combobox', { name: '仅显示受阻清理' }), {
    target: { value: 'false' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: '清理状态' }), {
    target: { value: 'ready' },
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) => {
        const query = new URL(requestUrl(input), 'http://localhost').searchParams;
        return query.get('blocked') === 'false' && query.get('state') === 'ready';
      }),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([input]) =>
          new URL(requestUrl(input), 'http://localhost').searchParams.get('page') === '2',
      ),
    ).toBe(true),
  );
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: '刷新' }));
  expect(await screen.findByText('denied-request')).toBeVisible();
  denied = false;
  fireEvent.click(screen.getAllByRole('button', { name: '重试' })[0] ?? document.body);
  await screen.findByRole('button', { name: first });
  ui.denied.add('assets.listCleanup');
  view.rerender(
    <Harness locale="zh">
      <CleanupPage />
    </Harness>,
  );
  expect(screen.getByText('当前账号没有访问此功能的权限。')).toBeVisible();
});
it('does not reveal ledger details or allow retries without their actual operation grants', async () => {
  ui.search = `selected=${first}`;
  ui.denied.add('assets.getCleanup');
  render(
    <Harness>
      <CleanupPage />
    </Harness>,
  );
  expect(
    await within(screen.getByRole('dialog')).findByText('This account cannot access this feature.'),
  ).toBeVisible();
  expect(
    fetcher.mock.calls.some(([input]) => requestUrl(input).endsWith(`/asset-cleanups/${first}`)),
  ).toBe(false);
  expect(screen.queryByRole('button', { name: 'Request cleanup retry' })).not.toBeInTheDocument();
});
