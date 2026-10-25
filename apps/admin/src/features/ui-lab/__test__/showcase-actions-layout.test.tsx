import { expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderLab } from './lab-support';
import { ActionsShowcase } from '../actions-showcase';
import { LayoutShowcase } from '../layout-showcase';
import { categoryIds, coverageRows } from '../catalog';

it('the catalog covers all 39 reference guides and routes exceptional examples to their actual pages', () => {
  expect(categoryIds).toHaveLength(7);
  expect(coverageRows).toHaveLength(39);
  expect(new Set(coverageRows.map((row) => row.guide)).size).toBe(39);
  expect(coverageRows.find((row) => row.guide === 'Relationship and Upload Inputs')?.scenario).toBe(
    'documents',
  );
  expect(coverageRows.find((row) => row.guide === 'Draggable Sortable')?.scenario).toBe('data');
  expect(coverageRows.find((row) => row.guide === 'Icons')?.scenario).toBe('actions');
});

it('action variants record local clicks and expose real disabled and busy states', () => {
  renderLab(<ActionsShowcase />, { pathname: '/ui/actions' });
  fireEvent.click(screen.getByRole('button', { name: '主按钮' }));
  fireEvent.click(screen.getByRole('button', { name: '描边按钮' }));
  expect(screen.getByLabelText('按钮与动作')).toHaveTextContent('已记录 2 次本地点击');
  expect(screen.getByRole('button', { name: '禁用按钮' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '切换忙碌状态' }));
  expect(screen.getByRole('button', { name: '忙碌按钮' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '切换忙碌状态' }));
  fireEvent.click(screen.getByRole('button', { name: '忙碌按钮' }));
  expect(screen.getByLabelText('按钮与动作')).toHaveTextContent('已记录 3 次本地点击');
});

it('clipboard rejection remains visible and example navigation preserves safe link semantics', async () => {
  renderLab(<ActionsShowcase />, { pathname: '/ui/actions' });
  fireEvent.click(screen.getByRole('checkbox', { name: '演示剪贴板拒绝' }));
  fireEvent.click(screen.getByRole('button', { name: '复制品牌名称' }));
  expect(await screen.findByText('复制被拒绝，请重试。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '展开或收起示例导航' }));
  const menu = screen.getByRole('navigation', { name: '展开或收起示例导航' });
  expect(menu).toHaveTextContent('输入控件');
  expect(screen.getByRole('link', { name: 'Payload 组件文档' })).toHaveAttribute(
    'rel',
    expect.stringContaining('noopener'),
  );
  expect(screen.queryByRole('link', { name: '不安全协议链接已禁用' })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: '搜索图标' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '展开或收起示例导航' }));
  expect(screen.queryByRole('navigation', { name: '展开或收起示例导航' })).not.toBeInTheDocument();
});

it('layout examples expand content, change measured height and retain navigable cards', async () => {
  const observe = vi.spyOn(ResizeObserver.prototype, 'observe');
  renderLab(<LayoutShowcase />, { pathname: '/ui/layout' });
  expect(screen.getAllByRole('link', { name: /打开列表场景/ }).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: '展开更多内容' }));
  expect(screen.getByRole('button', { name: '展开更多内容' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('button', { name: '不可用的折叠区' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '增加一段内容' }));
  expect(screen.getByText(/^合成段落 2/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '减少一段内容' }));
  await waitFor(() => expect(screen.queryByText(/^合成段落 2/)).not.toBeInTheDocument());
  expect(observe).toHaveBeenCalled();
  observe.mockRestore();
});
