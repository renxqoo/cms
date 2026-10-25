import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderLab } from './lab-support';
import { DataTableExample } from '../data-table-example';
import { DataShowcase } from '../data-showcase';

const originalURL = URL;
afterEach(() => vi.stubGlobal('URL', originalURL));

it('table selection excludes locked rows, records eligible IDs and clears on page changes', async () => {
  const user = userEvent.setup();
  renderLab(<DataTableExample />, { locale: 'en', pathname: '/ui/data' });
  expect(screen.getByRole('checkbox', { name: 'Select Welcome to OneAster' })).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: 'Select eligible content on this page' }));
  expect(screen.getByText('4 selected')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Record local selection event' }));
  expect(screen.getByLabelText('Latest local row event')).toHaveTextContent('example-guide');
  expect(screen.getByLabelText('Latest local row event')).not.toHaveTextContent(
    'example-introduction',
  );
  await user.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText('4 selected')).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Select Content editing guide' }));
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Pre-publication checklist' })).toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Items per page' }), '10');
  expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'Welcome to OneAster' })).toBeInTheDocument();
});

it('table states remain recoverable and columns and sorting affect the real rows', async () => {
  const user = userEvent.setup();
  renderLab(<DataTableExample />, { locale: 'en', pathname: '/ui/data' });
  const state = screen.getByRole('combobox', { name: 'Table display state' });
  await user.selectOptions(state, 'loading');
  expect(screen.getByText('Loading synthetic content')).toBeInTheDocument();
  await user.selectOptions(state, 'empty');
  expect(screen.getByText('There is no synthetic content to display.')).toBeInTheDocument();
  await user.selectOptions(state, 'error');
  expect(screen.getByText('This is a recoverable synthetic loading error.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Restore local list' }));
  await user.click(screen.getByRole('button', { name: 'Visible columns' }));
  const popup = await screen.findByRole('dialog');
  expect(within(popup).getByRole('checkbox', { name: 'Title' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await user.click(within(popup).getByRole('checkbox', { name: 'Enabled' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('columnheader', { name: 'Enabled' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort field' }), 'title');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Ascending / Descending' }),
    'desc',
  );
  const [, first] = screen.getAllByRole('row');
  if (!first) throw new Error('Missing first data row');
  expect(within(first).getByRole('cell', { name: 'Welcome to OneAster' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Title' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Sort field' }), '');
  expect(screen.getByRole('combobox', { name: 'Ascending / Descending' })).toBeDisabled();
});

it('row actions record the selected row and related cells retain their real guarded link', async () => {
  const user = userEvent.setup();
  renderLab(<DataTableExample />, { locale: 'en', pathname: '/ui/data' });
  await user.click(screen.getByRole('button', { name: 'Open actions for Content editing guide' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Record this local row event' }));
  expect(screen.getByLabelText('Latest local row event')).toHaveTextContent(
    'Content editing guide',
  );
  expect(screen.getAllByRole('link', { name: 'Documents workbench' })[0]).toHaveAttribute(
    'href',
    '/ui/documents',
  );
});

it('local thumbnails release object URLs on replacement, removal and workbench unmount', async () => {
  const createObjectURL = vi
    .fn<() => string>()
    .mockReturnValueOnce('blob:preview-1')
    .mockReturnValueOnce('blob:preview-2')
    .mockReturnValueOnce('blob:preview-3');
  const revokeObjectURL = vi.fn<(href: string) => void>();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static override createObjectURL = createObjectURL;
      static override revokeObjectURL = revokeObjectURL;
    },
  );
  const view = renderLab(<DataShowcase />, { locale: 'en', pathname: '/ui/data' });
  fireEvent.click(screen.getByRole('button', { name: 'Generate local image preview' }));
  expect(await screen.findByRole('img', { name: 'OneAster synthetic image' })).toHaveAttribute(
    'src',
    'blob:preview-1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generate local image preview' }));
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove image preview' }));
  await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-2'));
  expect(screen.queryByRole('img', { name: 'OneAster synthetic image' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Generate local image preview' }));
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-3');
});

it('sorting controls apply horizontal orientation and disable only the requested handles', async () => {
  const user = userEvent.setup();
  renderLab(<DataShowcase />, { locale: 'en', pathname: '/ui/data' });
  const first = screen.getByRole('button', { name: 'Move Welcome to OneAster' });
  const second = screen.getByRole('button', { name: 'Move Content editing guide' });
  expect(first).not.toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: 'Lock first item' }));
  expect(first).toBeDisabled();
  expect(second).not.toBeDisabled();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Sorting direction' }),
    'horizontal',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Disable all reordering' }));
  expect(second).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: 'Disable all reordering' }));
  expect(second).not.toBeDisabled();
});
