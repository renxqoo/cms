import { afterEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { FolderManager } from '../folders';
import { contentMessages } from '../messages';
import { folderId } from './support';

const report = vi.hoisted(() => vi.fn<() => void>());
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ can: () => true, reportResult: report }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/collections/articles',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));
afterEach(() => vi.unstubAllGlobals());

it('regression: real request client sends folder collection in query and JSON rather than nonexistent path parameters', async () => {
  const calls: { method: string; url: string; body: unknown }[] = [];
  let folder: {
    id: string;
    parentId: null;
    name: string;
    version: number;
    createdAt: string;
    updatedAt: string;
  } | null = null;
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    if (method === 'GET')
      return Promise.resolve(Response.json({ rows: folder ? [{ ...folder, children: [] }] : [] }));
    if (method === 'DELETE') {
      folder = null;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    const next =
      typeof body === 'object' && body !== null && 'name' in body && typeof body.name === 'string'
        ? body.name
        : '';
    folder = {
      id: folderId,
      parentId: null,
      name: next,
      version: method === 'POST' ? 1 : 2,
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    };
    return Promise.resolve(Response.json(folder, { status: method === 'POST' ? 201 : 200 }));
  });
  vi.stubGlobal('fetch', fetcher);
  const user = userEvent.setup();
  renderManagement(
    <FolderManager collection="articles" t={contentMessages.en} onChanged={() => {}} />,
  );
  await waitFor(() =>
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: '/api/cms/v1/folders?collection=articles',
    }),
  );
  await user.click(screen.getByRole('button', { name: 'New folder' }));
  await user.type(screen.getByLabelText('Name', { exact: true }), 'Editorial');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Editorial', { exact: true });
  expect(calls.find((call) => call.method === 'POST')).toMatchObject({
    url: '/api/cms/v1/folders',
    body: { collection: 'articles', name: 'Editorial', parentId: null },
  });
  await user.click(screen.getByRole('button', { name: 'Edit folder' }));
  await user.clear(screen.getByLabelText('Name', { exact: true }));
  await user.type(screen.getByLabelText('Name', { exact: true }), 'Renamed');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Renamed', { exact: true });
  expect(calls.find((call) => call.method === 'PATCH')).toMatchObject({
    url: `/api/cms/v1/folders/${folderId}`,
    body: { collection: 'articles', version: 1, name: 'Renamed' },
  });
  await user.click(screen.getByRole('button', { name: 'Delete folder' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByText('Renamed', { exact: true })).not.toBeInTheDocument(),
  );
  expect(calls.find((call) => call.method === 'DELETE')).toMatchObject({
    url: `/api/cms/v1/folders/${folderId}?collection=articles&version=2`,
    body: null,
  });
});
