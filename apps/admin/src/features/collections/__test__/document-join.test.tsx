import {
  pageApi,
  resetPageApi,
  defaultPageRequest,
  record,
  recordId,
  secondId,
  oldVersion,
  newVersion,
  ok,
} from './page-fixture';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';
import { DocumentJoin } from '../document-join';
import { catalog, snapshot, deferred } from './support';
import type { EditorNode } from '../../../contracts/editor';
import { failure } from '../../../api/result';

const node: EditorNode = {
  id: 'joined',
  name: 'joined',
  path: 'joined',
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
      record({ id: recordId, collection: 'pages', data: { title: 'Alpha' } }),
      record({ id: secondId, collection: 'pages', data: { title: 'Bravo' } }),
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
    input.operation === 'documents.join' ? Promise.resolve(ok(page())) : defaultPageRequest(input),
  );
});
afterEach(() => vi.resetAllMocks());

it('pages and filters Join rows independently without submitting the containing document form', async () => {
  let current = 1;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.join') {
      current = Number(input.query?.page);
      return Promise.resolve(
        ok(
          page({
            page: current,
            total: 3,
            hasNextPage: current === 1,
            rows:
              current === 1
                ? page().rows
                : [record({ collection: 'pages', data: { title: 'Charlie' } })],
          }),
        ),
      );
    }
    return defaultPageRequest(input);
  });
  const submitted = vi.fn<() => void>();
  renderManagement(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitted();
      }}
    >
      <DocumentJoin
        snapshot={snapshot()}
        collections={collections}
        node={node}
        active
        readOnly={false}
      />
    </form>,
  );
  await screen.findByRole('button', { name: 'Alpha' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('button', { name: 'Charlie' });
  expect(current).toBe(2);
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Add condition' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter field' }), {
    target: { value: 'title' },
  });
  await userEvent.type(screen.getByLabelText('Filter value'), 'A');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls
        .filter(([request]) => request.operation === 'documents.join')
        .at(-1)?.[0].query,
    ).toMatchObject({
      page: 1,
      count: true,
      depth: 1,
      where: { field: 'title', operator: 'eq', value: 'A' },
    }),
  );
  expect(submitted).not.toHaveBeenCalled();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Alpha' }));
  expect(pageApi.push).toHaveBeenCalledWith(
    `/dashboard/collections/pages/${recordId}?locale=en&mode=editing`,
    undefined,
  );
});

it('reorders visible neighbors by keyboard and drag with opaque CAS and verifies conflicts before retry', async () => {
  let conflict = true;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.join')
      return Promise.resolve(ok(page({ orderVersion: conflict ? oldVersion : newVersion })));
    if (input.operation === 'documents.reorderJoin') {
      if (conflict) {
        conflict = false;
        return Promise.resolve(failure('version_conflict', 409));
      }
      return Promise.resolve(ok({ version: newVersion }));
    }
    return defaultPageRequest(input);
  });
  renderManagement(
    <DocumentJoin
      snapshot={snapshot()}
      collections={collections}
      node={node}
      active
      readOnly={false}
    />,
  );
  const up = await screen.findByRole('button', { name: 'Move up Bravo' });
  await waitFor(() => expect(up).toBeEnabled());
  up.focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(up).toBeDisabled());
  expect(
    pageApi.request.mock.calls.find(
      ([request]) => request.operation === 'documents.reorderJoin',
    )?.[0],
  ).toMatchObject({
    params: { collection: 'articles', id: recordId, fieldId: 'joined' },
    body: {
      locale: 'en',
      version: oldVersion,
      ids: [secondId],
      targetId: recordId,
      position: 'before',
    },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() => expect(up).toBeEnabled());
  const first = screen.getByRole('button', { name: 'Drag to reorder Alpha' });
  const second = screen.getByRole('button', { name: 'Drag to reorder Bravo' });
  fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn<() => void>() } });
  fireEvent.dragOver(second);
  fireEvent.drop(second);
  fireEvent.dragEnd(first);
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
  ).toMatchObject({ version: newVersion, ids: [recordId], targetId: secondId, position: 'after' });
});

it('cancels stale language and inactive reads and ignores late rows after unmount', async () => {
  const pending = deferred<ReturnType<typeof ok>>();
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.join' ? pending.promise : defaultPageRequest(input),
  );
  const rendered = renderManagement(
    <DocumentJoin
      snapshot={snapshot()}
      collections={collections}
      node={node}
      active
      readOnly={false}
    />,
  );
  await waitFor(() =>
    expect(
      pageApi.request.mock.calls.some(([request]) => request.operation === 'documents.join'),
    ).toBe(true),
  );
  const first = pageApi.request.mock.calls.find(
    ([request]) => request.operation === 'documents.join',
  )?.[0];
  rendered.rerender(
    <ManagementTestProvider>
      <DocumentJoin
        snapshot={snapshot()}
        collections={collections}
        node={node}
        active={false}
        readOnly={false}
      />
    </ManagementTestProvider>,
  );
  await waitFor(() => expect(first?.signal.aborted).toBe(true));
  pending.resolve(ok(page()));
  expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
  rendered.unmount();
});

it('keeps create/copy Join fields read-only until persistence and gates order on target permissions', async () => {
  const created = snapshot({ document: null });
  const rendered = renderManagement(
    <DocumentJoin
      snapshot={created}
      collections={collections}
      node={node}
      active
      readOnly={false}
    />,
  );
  expect(screen.getByText('Save this document to view related records')).toBeInTheDocument();
  expect(pageApi.request).not.toHaveBeenCalled();
  rendered.unmount();
  pageApi.denied.add('documents.update');
  renderManagement(
    <DocumentJoin
      snapshot={snapshot()}
      collections={collections}
      node={node}
      active
      readOnly={false}
    />,
  );
  await screen.findByRole('button', { name: 'Alpha' });
  expect(screen.queryByRole('button', { name: 'Move up Bravo' })).not.toBeInTheDocument();
});
