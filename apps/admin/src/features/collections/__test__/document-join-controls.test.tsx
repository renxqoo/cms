import {
  pageApi,
  resetPageApi,
  defaultPageRequest,
  record,
  recordId,
  secondId,
  oldVersion,
  ok,
} from './page-fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentJoin } from '../document-join';
import { catalog, snapshot, editor } from './support';
import type { EditorNode } from '../../../contracts/editor';
import { failure } from '../../../api/result';

const node: EditorNode = {
  id: 'joined',
  type: 'join',
  label: 'Related pages',
  required: false,
  localized: false,
  write: 'denied',
  constraints: {
    join: { collections: ['pages'], orderable: true, defaultPageSize: 2, maxPageSize: 100 },
  },
};
const collections = [catalog({ key: 'pages', label: 'Pages' })];
function page(overrides: Record<string, unknown> = {}) {
  return {
    rows: [
      record({ collection: 'pages', data: { title: 'Alpha' } }),
      record({ collection: 'pages', id: secondId, data: { title: 'Bravo' } }),
    ],
    page: 1,
    pageSize: 2,
    hasNextPage: false,
    total: 2,
    sort: [{ field: '_order', order: 'asc' }],
    orderVersion: oldVersion,
    ...overrides,
  };
}
beforeEach(() => {
  resetPageApi();
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.join'
      ? Promise.resolve(
          ok(page({ sort: input.query?.sort ?? page().sort, pageSize: input.query?.pageSize })),
        )
      : defaultPageRequest(input),
  );
});
afterEach(() => vi.resetAllMocks());

it('applies independent sort and bounded page sizes without submitting an enclosing editor form', async () => {
  const submit = vi.fn<() => void>();
  renderManagement(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DocumentJoin
        snapshot={snapshot()}
        node={node}
        collections={collections}
        active
        readOnly={false}
      />
    </form>,
  );
  await screen.findByRole('button', { name: 'Alpha' });
  await userEvent.click(screen.getByRole('button', { name: 'Sort' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort 1' }), {
    target: { value: 'title' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Comparison 1' }), {
    target: { value: 'desc' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await userEvent.keyboard('{Escape}');
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls
        .filter(([request]) => request.operation === 'documents.join')
        .at(-1)?.[0].query,
    ).toMatchObject({ page: 1, sort: [{ field: 'title', order: 'desc' }] }),
  );
  expect(screen.queryByRole('button', { name: 'Move up Bravo' })).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
  const size = screen.getByRole('spinbutton', { name: 'Page size' });
  fireEvent.change(size, { target: { value: '4' } });
  fireEvent.keyDown(size, { key: 'Enter' });
  fireEvent.blur(size);
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls
        .filter(([request]) => request.operation === 'documents.join')
        .at(-1)?.[0].query,
    ).toMatchObject({ page: 1, pageSize: 4 }),
  );
  const next = screen.getByRole('spinbutton', { name: 'Page size' });
  fireEvent.change(next, { target: { value: '101' } });
  fireEvent.blur(next);
  expect(next).toHaveValue(4);
  expect(submit).not.toHaveBeenCalled();
});

it('keeps descending keyboard and drag moves relative to the visible target order', async () => {
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.join')
      return Promise.resolve(ok(page({ sort: [{ field: '_order', order: 'desc' }] })));
    if (input.operation === 'documents.reorderJoin')
      return Promise.resolve(ok({ version: oldVersion }));
    return defaultPageRequest(input);
  });
  renderManagement(
    <DocumentJoin
      snapshot={snapshot()}
      node={node}
      collections={collections}
      active
      readOnly={false}
    />,
  );
  const up = await screen.findByRole('button', { name: 'Move up Bravo' });
  await waitFor(() => expect(up).toBeEnabled());
  await userEvent.click(up);
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls
        .filter(([request]) => request.operation === 'documents.reorderJoin')
        .at(-1)?.[0].body,
    ).toMatchObject({ ids: [secondId], targetId: recordId, position: 'after' }),
  );
  const first = screen.getByRole('button', { name: 'Drag to reorder Alpha' });
  await waitFor(() => expect(first).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Move down Alpha' }));
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.filter(
        ([request]) => request.operation === 'documents.reorderJoin',
      ),
    ).toHaveLength(2),
  );
  expect(
    pageApi.request.mock.calls
      .filter(([request]) => request.operation === 'documents.reorderJoin')
      .at(-1)?.[0].body,
  ).toMatchObject({ ids: [recordId], targetId: secondId, position: 'before' });
  await waitFor(() => expect(first).toBeEnabled());
  const second = screen.getByRole('button', { name: 'Drag to reorder Bravo' });
  fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn<() => void>() } });
  fireEvent.drop(second);
  fireEvent.dragEnd(first);
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls
        .filter(([request]) => request.operation === 'documents.reorderJoin')
        .at(-1)?.[0].body,
    ).toMatchObject({ ids: [recordId], targetId: secondId, position: 'before' }),
  );
  expect(
    pageApi.request.mock.calls.filter(([request]) => request.operation === 'documents.reorderJoin'),
  ).toHaveLength(3);
});

it('retries failed Join reads and shows an empty read-only published page without private target labels', async () => {
  let failed = true;
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.join'
      ? Promise.resolve(
          failed
            ? failure('temporarily_unavailable', 503)
            : ok(page({ rows: [], sort: [], total: 0, hasNextPage: false })),
        )
      : defaultPageRequest(input),
  );
  renderManagement(
    <DocumentJoin
      snapshot={snapshot({ editor: editor({ intent: 'read', mode: 'published' }) })}
      node={node}
      collections={[]}
      active
      readOnly
    />,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  failed = false;
  await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
  await screen.findByText('No related records');
  expect(screen.queryByRole('button', { name: 'Move up Bravo' })).not.toBeInTheDocument();
  expect(
    pageApi.request.mock.calls
      .filter(([request]) => request.operation === 'documents.join')
      .at(-1)?.[0].query,
  ).toMatchObject({ mode: 'published' });
});

it('does not load source inverse relationships while copying a document', () => {
  renderManagement(
    <DocumentJoin
      snapshot={snapshot({ editor: editor({ intent: 'copy' }) })}
      node={node}
      collections={collections}
      active
      readOnly={false}
    />,
  );
  expect(screen.getByText('Save this document to view related records')).toBeInTheDocument();
  expect(pageApi.request).not.toHaveBeenCalled();
});
