import {
  pageApi,
  resetPageApi,
  collection,
  record,
  descriptor,
  recordId,
  secondId,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentEditorPage } from '../editor-page';
import type { Document } from '../../../contracts/documents';
import { failure } from '../../../api/result';

beforeEach(resetPageApi);
afterEach(() => vi.resetAllMocks());
function fixture(filtered = false) {
  const target = { ...collection, key: 'pages', label: 'Pages' };
  let page: Document | null = null;
  const related = {
    id: 'related',
    name: 'related',
    path: 'related',
    type: 'relationship' as const,
    label: 'Related',
    required: false,
    localized: false,
    write: 'allowed' as const,
    constraints: { relationTo: ['pages'], filterOptions: filtered },
  };
  pageApi.request.mockImplementation((input) => {
    const isPage = input.params?.collection === 'pages';
    if (input.operation === 'collections.list')
      return Promise.resolve(ok({ rows: [collection, target] }));
    if (input.operation === 'collections.get')
      return Promise.resolve(ok(isPage ? target : collection));
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(
          isPage
            ? descriptor(input.query?.intent === 'create' ? null : page, {
                collection: 'pages',
                intent: input.query?.intent === 'create' ? 'create' : 'update',
              })
            : descriptor(record(), { layout: [...descriptor().layout, related] }),
        ),
      );
    if (input.operation === 'collections.previewEditor')
      return Promise.resolve(ok({ behaviorHash: 'behavior', visibility: {} }));
    if (input.operation === 'collections.fieldOptions')
      return Promise.resolve(ok({ rows: [], total: 0, page: 1, pageSize: 20 }));
    if (isPage && input.operation === 'documents.create') {
      page = record({
        id: secondId,
        collection: 'pages',
        revision: 1,
        data: { title: 'Created page' },
      });
      return Promise.resolve(ok(page, 201));
    }
    if (isPage && input.operation === 'documents.update') {
      page = record({
        id: secondId,
        collection: 'pages',
        revision: 2,
        data: { title: 'Updated page' },
      });
      return Promise.resolve(ok(page));
    }
    if (isPage && input.operation === 'documents.get')
      return Promise.resolve(page ? ok(page) : failure('not_found', 404));
    return defaultPageRequest(input);
  });
  return { page: () => page };
}

it('creates and edits a selected relationship in the existing editor drawer without navigating away or replacing the parent draft', async () => {
  const user = userEvent.setup();
  fixture();
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const create = await screen.findByRole('button', { name: 'Create Pages' });
  await user.click(create);
  let dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /^Title/ }), {
    target: { value: 'Created page' },
  });
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('Story');
  expect(screen.getByText('Created page')).toBeVisible();
  expect(pageApi.replace).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Edit Created page' }));
  dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /^Title/ }), {
    target: { value: 'Updated page' },
  });
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Updated page')).toBeVisible();
  expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('Story');
  expect(pageApi.push).not.toHaveBeenCalled();
});

it('keeps a saved document out of the selection when its source field filter rejects it and restores focus on close', async () => {
  const user = userEvent.setup();
  const model = fixture(true);
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const create = await screen.findByRole('button', { name: 'Create Pages' });
  await user.click(create);
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /^Title/ }), {
    target: { value: 'Created page' },
  });
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByText(/does not meet this field/);
  expect(model.page()?.id).toBe(secondId);
  expect(
    pageApi.request.mock.calls.find(
      ([input]) => input.operation === 'collections.fieldOptions',
    )?.[0].body,
  ).toMatchObject({ id: secondId, path: 'related' });
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByText('Created page')).not.toBeInTheDocument();
  expect(create).toHaveFocus();
});
