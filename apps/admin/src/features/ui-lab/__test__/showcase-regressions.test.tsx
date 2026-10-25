import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderLab } from './lab-support';
import { FeedbackShowcase } from '../feedback-showcase';
import { DataTableExample } from '../data-table-example';
import { OverlaysShowcase } from '../overlays-showcase';

it('indeterminate progress does not announce an obsolete numeric percentage', () => {
  renderLab(<FeedbackShowcase />, { pathname: '/ui/feedback' });
  fireEvent.click(screen.getByRole('checkbox', { name: '不确定进度' }));
  expect(screen.getByRole('progressbar', { name: '示例进度' })).toHaveAttribute(
    'aria-valuetext',
    '不确定进度',
  );
});

it('switching a later table page to empty content shows a valid empty pagination summary', () => {
  renderLab(<DataTableExample />, { pathname: '/ui/data' });
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  fireEvent.change(screen.getByRole('combobox', { name: '表格展示状态' }), {
    target: { value: 'empty' },
  });
  expect(screen.getByText(/第 1 页，共 1 页/)).toBeInTheDocument();
  expect(screen.getByText(/共 0 条/)).toBeInTheDocument();
});

it('the destructive-style menu action opens a real confirmation instead of an unrelated details dialog', async () => {
  const user = userEvent.setup();
  renderLab(<OverlaysShowcase />, { pathname: '/ui/overlays' });
  await user.click(screen.getByRole('button', { name: '打开行操作' }));
  await user.click(await screen.findByRole('menuitem', { name: '危险样式确认' }));
  expect(await screen.findByRole('dialog', { name: '确认本地示例操作' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '确认本地操作' })).toBeInTheDocument();
});
