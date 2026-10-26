import { pageApi, resetPageApi, ok, defaultPageRequest, recordId, date } from './page-fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentListPage } from '../list-page';

beforeEach(resetPageApi);
afterEach(() => vi.resetAllMocks());

it('keeps folder management in a searchable dialog and restores the header trigger on Escape', async () => {
  const folder = {
    id: recordId,
    name: 'Editorial',
    parentId: null,
    version: 1,
    createdAt: date,
    updatedAt: date,
    children: [],
  };
  pageApi.request.mockImplementation((input) =>
    input.operation === 'folders.list'
      ? Promise.resolve(ok({ rows: [folder] }))
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Story' });
  const trigger = screen.getByRole('button', { name: 'Manage folders' });
  expect(trigger.closest('header')).not.toBeNull();
  expect(screen.queryByRole('heading', { name: 'Manage folders' })).not.toBeInTheDocument();
  await userEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Manage folders' });
  expect(await within(dialog).findByText('Editorial')).toBeVisible();
  const search = within(dialog).getByRole('textbox', { name: 'Search folders' });
  await userEvent.type(search, 'missing');
  expect(within(dialog).getByText('No matching folders.')).toBeVisible();
  await userEvent.clear(search);
  expect(within(dialog).getByText('Editorial')).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('refreshes the folder filter after creating a folder inside management without leaving the list', async () => {
  const folder = {
    id: recordId,
    name: 'New editorial folder',
    parentId: null,
    version: 1,
    createdAt: date,
    updatedAt: date,
  };
  let created = false;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list')
      return Promise.resolve(ok({ rows: created ? [{ ...folder, children: [] }] : [] }));
    if (input.operation === 'folders.create') {
      created = true;
      return Promise.resolve(ok(folder, 201));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Story' });
  await userEvent.click(screen.getByRole('button', { name: 'Manage folders' }));
  await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
  const editor = screen.getByRole('dialog', { name: 'New folder' });
  await userEvent.type(within(editor).getByRole('textbox', { name: 'Name' }), folder.name);
  await userEvent.click(within(editor).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(editor).not.toBeInTheDocument());
  expect(screen.getByRole('dialog', { name: 'Manage folders' })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const select = screen.getByRole('combobox', { name: 'Folder' });
  expect(within(select).getByRole('option', { name: folder.name })).toHaveValue(folder.id);
  expect(pageApi.push).not.toHaveBeenCalled();
});
