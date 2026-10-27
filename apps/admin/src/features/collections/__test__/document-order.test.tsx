import {
  pageApi,
  resetPageApi,
  collection,
  record,
  recordId,
  secondId,
  oldVersion,
  newVersion,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentOrderFeedback, documentOrderColumn, useDocumentOrdering } from '../document-order';
import { parseDocumentQuery, documentTitle } from '../query';
import type { DocumentQuery } from '../query';
import { failure } from '../../../api/result';

const configured = {
  ...collection,
  orderable: true,
  fields: [
    ...collection.fields,
    {
      id: 'location',
      path: 'location',
      type: 'point',
      label: 'Location',
      required: false,
      localized: false,
      queryable: true,
      sortable: true,
    },
  ],
};
const rows = [
  record({ data: { title: 'Alpha' } }),
  record({ id: secondId, data: { title: 'Bravo' } }),
];
const changed = vi.fn<() => void>();
const sorted = vi.fn<() => void>();
const initial = parseDocumentQuery(
  new URLSearchParams({
    locale: 'zh-CN',
    sort: JSON.stringify([{ field: '_order', order: 'asc' }]),
  }),
  configured,
);
function Harness({ query = initial }: { query?: DocumentQuery }) {
  const controller = useDocumentOrdering({
    collection: configured,
    query,
    rows,
    onChanged: changed,
  });
  return (
    <>
      <DocumentOrderFeedback controller={controller} onSort={sorted} />
      <table>
        <tbody>
          {rows.map((document) => (
            <tr key={document.id}>
              <td>{documentTitle(document, configured)}</td>
              {documentOrderColumn(controller).map((column) => (
                <td key={column.key}>{column.cell(document)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
beforeEach(() => {
  resetPageApi();
  changed.mockReset();
  sorted.mockReset();
});
afterEach(() => vi.resetAllMocks());

it('moves by keyboard and drag under the selected content locale and reloads server order after success', async () => {
  let version = oldVersion;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.order') return Promise.resolve(ok({ version }));
    if (input.operation === 'documents.reorder') {
      version = newVersion;
      return Promise.resolve(ok({ version }));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<Harness />);
  const up = await screen.findByRole('button', { name: 'Move up Bravo' });
  await waitFor(() => expect(up).toBeEnabled());
  up.focus();
  await userEvent.keyboard('{Enter}');
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'documents.reorder')?.[0],
  ).toMatchObject({
    params: { collection: 'articles' },
    body: {
      locale: 'zh-CN',
      version: oldVersion,
      ids: [secondId],
      targetId: recordId,
      position: 'before',
    },
  });
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  const first = screen.getByRole('button', { name: 'Drag to reorder Alpha' });
  await waitFor(() => expect(first).toBeEnabled());
  const target = screen.getByRole('button', { name: 'Drag to reorder Bravo' });
  fireEvent.dragStart(first, { dataTransfer: { setData: vi.fn<() => void>() } });
  fireEvent.dragOver(target);
  fireEvent.drop(target);
  fireEvent.dragEnd(first);
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  expect(
    pageApi.request.mock.calls
      .filter(([input]) => input.operation === 'documents.reorder')
      .at(-1)?.[0].body,
  ).toMatchObject({ version: newVersion, ids: [recordId], targetId: secondId, position: 'after' });
});

it('retains server rows and locks conflicts until an explicit current-order read completes', async () => {
  let conflict = true;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'documents.order')
      return Promise.resolve(ok({ version: conflict ? oldVersion : newVersion }));
    if (input.operation === 'documents.reorder') {
      conflict = false;
      return Promise.resolve(failure('version_conflict', 409));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<Harness />);
  const down = await screen.findByRole('button', { name: 'Move down Alpha' });
  await waitFor(() => expect(down).toBeEnabled());
  await userEvent.click(down);
  await screen.findByRole('button', { name: 'Read current order' });
  expect(changed).not.toHaveBeenCalled();
  expect(down).toBeDisabled();
  expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual(['Alpha', 'Bravo']);
  await userEvent.click(screen.getByRole('button', { name: 'Read current order' }));
  await waitFor(() => expect(down).toBeEnabled());
  expect(changed).toHaveBeenCalledTimes(1);
});

it('shows the custom-sort switch and suppresses movement for denied, published or trash views', async () => {
  const view = renderManagement(
    <Harness query={{ ...initial, sort: [{ field: 'title', order: 'asc' }] }} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Custom order' }));
  expect(sorted).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Move down Alpha' })).not.toBeInTheDocument();
  view.unmount();
  pageApi.denied.add('documents.reorder');
  const denied = renderManagement(<Harness />);
  expect(screen.queryByRole('button', { name: 'Move down Alpha' })).not.toBeInTheDocument();
  denied.unmount();
  pageApi.denied.clear();
  const published = renderManagement(<Harness query={{ ...initial, mode: 'published' }} />);
  expect(screen.queryByRole('button', { name: 'Move down Alpha' })).not.toBeInTheDocument();
  published.unmount();
  renderManagement(<Harness query={{ ...initial, trashed: true }} />);
  expect(screen.queryByRole('button', { name: 'Move down Alpha' })).not.toBeInTheDocument();
});

it('uses reversed placement for descending views and ignores external, self and ended drags', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.order' || input.operation === 'documents.reorder'
      ? Promise.resolve(ok({ version: oldVersion }))
      : defaultPageRequest(input),
  );
  renderManagement(<Harness query={{ ...initial, sort: [{ field: '_order', order: 'desc' }] }} />);
  const up = await screen.findByRole('button', { name: 'Move up Bravo' });
  await waitFor(() => expect(up).toBeEnabled());
  const handle = screen.getByRole('button', { name: 'Drag to reorder Alpha' });
  fireEvent.drop(handle);
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'documents.reorder'),
  ).toHaveLength(0);
  fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn<() => void>() } });
  fireEvent.drop(handle);
  fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn<() => void>() } });
  fireEvent.dragEnd(handle);
  fireEvent.drop(screen.getByRole('button', { name: 'Drag to reorder Bravo' }));
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'documents.reorder'),
  ).toHaveLength(0);
  await userEvent.click(up);
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'documents.reorder')?.[0].body,
  ).toMatchObject({ ids: [secondId], targetId: recordId, position: 'after' });
});

it('does not offer rank reordering when a nested near condition controls list ordering', () => {
  const where = {
    or: [
      { field: 'title', operator: 'eq', value: 'near' },
      { and: [{ field: 'location', operator: 'near', value: [0, 0, 1000, null] }] },
    ],
  };
  renderManagement(<Harness query={{ ...initial, where: JSON.stringify(where) }} />);
  expect(screen.queryByRole('button', { name: 'Move down Alpha' })).not.toBeInTheDocument();
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'documents.order')).toBe(
    false,
  );
});
