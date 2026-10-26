import {
  pageApi,
  resetPageApi,
  collection,
  record,
  descriptor,
  recordId,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentListPage } from '../list-page';
import { DocumentEditorPage } from '../editor-page';
import { CollectionStructurePage } from '../structure-page';
import { failure } from '../../../api/result';

beforeEach(resetPageApi);

it('regression: descendants of a localized parent are not described as shared across every language', async () => {
  pageApi.request.mockResolvedValueOnce(
    ok({
      ...collection,
      fields: [
        {
          id: 'translated',
          path: 'translated',
          type: 'group',
          label: 'Translated group',
          required: false,
          localized: true,
          queryable: false,
        },
        {
          id: 'translated_value',
          path: 'translated.value',
          type: 'text',
          label: 'Translated value',
          required: false,
          localized: false,
          queryable: false,
        },
      ],
    }),
  );
  renderManagement(<CollectionStructurePage collectionKey="articles" />);
  const label = await screen.findByText('Translated value', { exact: true });
  const row = label.closest('div');
  if (!row) throw new Error('A field must have a visible structure row.');
  expect(within(row).getByText(/Follows parent language rules/)).toBeVisible();
  expect(within(row).queryByText(/Shared across languages/)).not.toBeInTheDocument();
  expect(within(row).getByText('translated.value', { exact: true })).toBeVisible();
});

it('explains a denied structure read instead of rendering an unexplained empty workspace', () => {
  pageApi.denied.add('collections.get');
  renderManagement(<CollectionStructurePage collectionKey="articles" />);
  expect(screen.getByText('Your account lacks the required read permission.')).toBeInTheDocument();
  expect(pageApi.request).not.toHaveBeenCalled();
});

it.each([false, true])(
  'only offers document media when the collection supports upload: %s',
  async (upload) => {
    pageApi.request.mockImplementation((input) =>
      input.operation === 'collections.get'
        ? Promise.resolve(ok({ ...collection, upload }))
        : defaultPageRequest(input),
    );
    renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
    await screen.findByRole('textbox', { name: /^Title\*?$/ });
    expect(screen.queryByRole('complementary', { name: 'Document media' }) !== null).toBe(upload);
  },
);

it('reads safe collection structure without requiring permission to create or edit content', async () => {
  pageApi.denied.add('documents.create');
  pageApi.denied.add('collections.editor');
  renderManagement(<CollectionStructurePage collectionKey="articles" />);
  expect(await screen.findByText('Title', { exact: true })).toBeVisible();
  expect(
    pageApi.request.mock.calls.some(([input]) => input.operation === 'collections.editor'),
  ).toBe(false);
});

it('regression: selecting an active document cannot enable restoring it from an empty trash view', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.list' && input.query?.trashed
      ? Promise.resolve(ok({ rows: [], total: 0, page: 1, pageSize: 20 }))
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Select document Story' }));
  expect(screen.getByRole('button', { name: 'Bulk actions' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Trash' }));
  await screen.findByText('No matching records');
  expect(screen.queryByRole('button', { name: 'Bulk actions' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Current documents' }));
  expect(await screen.findByRole('checkbox', { name: 'Select document Story' })).not.toBeChecked();
});

it.each([
  ['Content language', 'zh-CN'],
  ['View', 'published'],
  ['Folder', 'root'],
])(
  'regression: changing %s discards selection from the previous content scope',
  async (label, value) => {
    renderManagement(<DocumentListPage collectionKey="articles" />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select document Story' }));
    fireEvent.change(screen.getByRole('combobox', { name: label }), { target: { value } });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Bulk actions' })).not.toBeInTheDocument(),
    );
  },
);

it('regression: a newer private draft is distinguished from the published document', async () => {
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await screen.findByRole('button', { name: 'Story' });
  expect(screen.getByText('Unpublished changes')).toBeInTheDocument();
});

it('regression: readable documents remain visible when their resource rule denies editing', async () => {
  pageApi.request.mockImplementation((input) => {
    if (input.operation !== 'collections.editor') return defaultPageRequest(input);
    if (input.query?.intent === 'update') return Promise.resolve(failure('not_found', 404));
    return Promise.resolve(
      ok(
        descriptor(record(), {
          intent: 'read',
          actions: [{ operationId: 'documents.update', state: 'denied' }],
        }),
      ),
    );
  });
  renderManagement(<DocumentEditorPage collectionKey={collection.key} documentId={recordId} />);
  expect(await screen.findByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('Story');
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  expect(screen.getByText('Read only')).toBeInTheDocument();
});

it('regression: history traversal clears a selection and closes an unsubmitted bulk dialog', async () => {
  const original = window.location.href;
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Select document Story' }));
  await userEvent.click(screen.getByRole('button', { name: 'Bulk actions' }));
  expect(screen.getByRole('dialog', { name: 'Bulk actions' })).toBeInTheDocument();
  try {
    act(() => {
      window.history.replaceState({}, '', '?trashed=true');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    act(() => {
      window.history.replaceState({}, '', original);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(
      await screen.findByRole('checkbox', { name: 'Select document Story' }),
    ).not.toBeChecked();
    expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'content.batch')).toBe(
      false,
    );
  } finally {
    window.history.replaceState({}, '', original);
  }
});

it('keeps explicit cross-page selections when only pagination or sorting changes', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.list'
      ? Promise.resolve(
          ok({ rows: [record()], total: 31, page: Number(input.query?.page ?? 1), pageSize: 20 }),
        )
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentListPage collectionKey="articles" />);
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Select document Story' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('checkbox', { name: 'Select document Story' })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Updated' }));
  expect(await screen.findByRole('checkbox', { name: 'Select document Story' })).toBeChecked();
});
