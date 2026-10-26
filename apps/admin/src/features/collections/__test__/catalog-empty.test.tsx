import { pageApi, resetPageApi, ok } from './page-fixture';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { CollectionCatalogPage } from '../catalog-page';
import { failure } from '../../../api/result';

beforeEach(resetPageApi);
afterEach(() => vi.resetAllMocks());

it('regression: an empty collection catalog explains missing access and opens real permission configuration', async () => {
  pageApi.request.mockResolvedValueOnce(ok({ rows: [] }));
  renderManagement(<CollectionCatalogPage />, 'zh');
  await screen.findByText('暂无可访问的内容集合');
  expect(screen.getByRole('status')).toHaveTextContent(
    '请由管理员检查集合接口的权限绑定及角色授权',
  );
  await userEvent.click(screen.getByRole('button', { name: '配置接口权限' }));
  expect(pageApi.push.mock.calls.at(-1)?.[0]).toBe(
    '/dashboard/endpoints?module=content&accessKind=permission',
  );
  await userEvent.click(screen.getByRole('button', { name: '管理权限' }));
  expect(pageApi.push.mock.calls.at(-1)?.[0]).toBe('/dashboard/permissions');
  pageApi.request.mockClear();
  await userEvent.click(screen.getByRole('button', { name: '刷新集合' }));
  await screen.findByText('Articles');
  expect(screen.queryByText('暂无可访问的内容集合')).not.toBeInTheDocument();
  expect(pageApi.request).toHaveBeenCalledOnce();
});

it.each([
  ['endpoints.list', 'permissions.list'],
  ['endpoints.createBinding', 'permissions.create'],
])(
  'regression: an empty catalog hides configuration when %s or %s is denied',
  async (endpoints, permissions) => {
    pageApi.denied.add(endpoints);
    pageApi.denied.add(permissions);
    pageApi.request.mockResolvedValue(ok({ rows: [] }));
    renderManagement(<CollectionCatalogPage />);
    await screen.findByText('No accessible collections');
    expect(
      screen.queryByRole('button', { name: 'Configure endpoint permissions' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage permissions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh collections' })).toBeEnabled();
  },
);

it('does not describe a failed catalog request as an empty collection list', async () => {
  pageApi.request.mockResolvedValue(failure('temporarily_unavailable', 503));
  renderManagement(<CollectionCatalogPage />);
  await screen.findByRole('alert');
  expect(screen.queryByText('No accessible collections')).not.toBeInTheDocument();
});
