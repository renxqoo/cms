import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Harness, node, rowA, rowB, services } from './support';
import type { ReferenceQuery, ReferencePage } from '../types';
import { fieldReferences } from '../reference-control';

it('paginates one selected collection at a time and resets to page one on a search change', async () => {
  const ports = services();
  ports.searchReferences.mockImplementation((query) =>
    Promise.resolve({
      rows: [
        {
          collection: query.collection,
          id: query.page === 1 ? rowA : rowB,
          label: `${query.collection}-${query.page}-${query.query}`,
        },
      ],
      total: 2,
      page: query.page,
      pageSize: 1,
    }),
  );
  render(
    <Harness
      services={ports}
      layout={[
        node('Related', {
          type: 'relationship',
          constraints: { relationTo: ['pages', 'images'], hasMany: true },
        }),
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose existing content' }));
  const dialog = screen.getByRole('dialog');
  await waitFor(() =>
    expect(within(dialog).getAllByText('Choose collection').length).toBeGreaterThan(0),
  );
  expect(ports.searchReferences).not.toHaveBeenCalled();
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Choose collection' }), {
    target: { value: 'pages' },
  });
  fireEvent.click(await within(dialog).findByRole('option', { name: 'Pages: pages-1-' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    Related: [{ collection: 'pages', id: rowA }],
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
  await within(dialog).findByRole('option', { name: 'Pages: pages-2-' });
  expect(ports.searchReferences).toHaveBeenLastCalledWith(
    expect.objectContaining({ collection: 'pages', page: 2, locale: 'en' }),
  );
  fireEvent.change(within(dialog).getByLabelText('Search content'), { target: { value: 'hello' } });
  await within(dialog).findByRole('option', { name: 'Pages: pages-1-hello' });
  expect(ports.searchReferences).toHaveBeenLastCalledWith(
    expect.objectContaining({ collection: 'pages', page: 1, query: 'hello' }),
  );
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Choose collection' }), {
    target: { value: 'images' },
  });
  fireEvent.click(await within(dialog).findByRole('option', { name: 'Images: images-1-hello' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    Related: [
      { collection: 'pages', id: rowA },
      { collection: 'images', id: rowA },
    ],
  });
  expect(within(dialog).getByRole('button', { name: 'Previous' })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({ Related: [] });
});

it('strips display-only labels from selected wire values and supports clearing a single reference', async () => {
  const ports = services();
  ports.searchReferences.mockResolvedValue({
    rows: [
      {
        collection: 'pages',
        id: rowB,
        label: 'Second',
        previewUrl: 'https://example.com/asset.png',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  render(
    <Harness
      services={ports}
      layout={[node('Related', { type: 'relationship', constraints: { relationTo: ['pages'] } })]}
      initial={{ Related: { collection: 'pages', id: rowA } }}
    />,
  );
  expect(screen.getByText(`Pages / ${rowA}`)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Choose existing content' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Pages: Second' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({
    Related: { collection: 'pages', id: rowB },
  });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  expect(screen.getByText('Second')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(JSON.parse(screen.getByLabelText('Data').textContent ?? '{}')).toEqual({ Related: null });
  expect(
    fieldReferences([{ collection: 'pages', id: rowA, label: 'Title' }, { id: 'bad' }, null]),
  ).toEqual([{ collection: 'pages', id: rowA }]);
  expect(fieldReferences(null)).toEqual([]);
});

it('shows retryable server failures and rejects mismatched pagination or collections', async () => {
  const ports = services();
  ports.searchReferences
    .mockRejectedValueOnce(new Error('Forbidden'))
    .mockResolvedValueOnce({
      rows: [{ collection: 'images', id: rowA, label: 'Wrong collection' }],
      total: 1,
      page: 1,
      pageSize: 10,
    })
    .mockResolvedValueOnce({ rows: [], total: 0, page: 2, pageSize: 10 })
    .mockResolvedValueOnce({ rows: [], total: 0, page: 1, pageSize: 0 })
    .mockResolvedValueOnce({
      rows: [{ collection: 'pages', id: rowA, label: 'Title' }],
      total: 0,
      page: 1,
      pageSize: 10,
    })
    .mockResolvedValue({
      rows: [{ collection: 'pages', id: rowA, label: 'Allowed' }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
  render(
    <Harness
      services={ports}
      layout={[node('Related', { type: 'relationship', constraints: { relationTo: ['pages'] } })]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose existing content' }));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await screen.findByText('Options could not be read. Check access or try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  }
  expect(await screen.findByRole('option', { name: 'Pages: Allowed' })).toBeVisible();
});

it('aborts stale reference searches and ignores their late resolution on query changes and unmount', async () => {
  const ports = services();
  const requests: { query: ReferenceQuery; resolve: (result: ReferencePage) => void }[] = [];
  ports.searchReferences.mockImplementation(
    (query) =>
      new Promise((resolve) => {
        requests.push({ query, resolve });
      }),
  );
  const view = render(
    <Harness
      services={ports}
      layout={[node('Related', { type: 'relationship', constraints: { relationTo: ['pages'] } })]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose existing content' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  fireEvent.change(screen.getByLabelText('Search content'), { target: { value: 'new' } });
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[0]?.query.signal.aborted).toBe(true);
  await act(async () => {
    requests[1]?.resolve({
      rows: [{ collection: 'pages', id: rowB, label: 'New' }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    requests[0]?.resolve({
      rows: [{ collection: 'pages', id: rowA, label: 'Stale' }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    await Promise.resolve();
  });
  expect(await screen.findByRole('option', { name: 'Pages: New' })).toBeVisible();
  expect(screen.queryByRole('option', { name: 'Pages: Stale' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Search content'), { target: { value: 'last' } });
  await waitFor(() => expect(requests).toHaveLength(3));
  view.unmount();
  expect(requests[2]?.query.signal.aborted).toBe(true);
});
