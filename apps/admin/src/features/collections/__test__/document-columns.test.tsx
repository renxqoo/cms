import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '@new-cms/ui/data';
import { documentColumns } from '../document-columns';
import { contentMessages } from '../messages';
import { catalog, document } from './support';

it('regression: a content title field does not collide with the document title column during table reconciliation', () => {
  const errors = vi.spyOn(console, 'error');
  const columns = documentColumns({
    collection: catalog(),
    t: contentMessages.en,
    locale: 'en',
    selected: [],
    select: () => {},
    visible: ['title', 'count', 'active'],
    trashed: false,
    open: () => {},
    trash: () => {},
    canRestore: true,
    canPurge: true,
  });
  try {
    render(
      <DataTable
        columns={columns}
        rows={[document()]}
        rowKey={(row) => row.id}
        emptyLabel="Empty"
        loadingLabel="Loading"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});

it('renders rich-text summaries without exposing the persisted JSON and formats the update time', () => {
  const configured = catalog();
  configured.fields.push({
    id: 'body',
    path: 'body',
    type: 'richText',
    label: 'Body',
    required: false,
    localized: true,
    queryable: false,
  });
  const row = document({
    data: {
      title: 'Readable story',
      body: {
        version: 1,
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: '<script>Literal text</script>' }],
          },
          { type: 'paragraph', children: [{ type: 'text', text: 'Second paragraph' }] },
        ],
      },
    },
  });
  render(
    <DataTable
      columns={documentColumns({
        collection: configured,
        t: contentMessages.en,
        locale: 'en',
        selected: [],
        select: () => {},
        visible: ['body'],
        trashed: false,
        open: () => {},
        trash: () => {},
        canRestore: false,
        canPurge: false,
      })}
      rows={[row]}
      rowKey={(entry) => entry.id}
      emptyLabel="Empty"
      loadingLabel="Loading"
    />,
  );
  expect(screen.getByText(/Literal text/)).toHaveTextContent(
    '<script>Literal text</script> Second paragraph',
  );
  expect(screen.queryByText(/"version"/)).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Confirm action' })).not.toBeInTheDocument();
  expect(window.document.querySelector('script')).toBeNull();
  const time = window.document.querySelector('time');
  expect(time).toHaveAttribute('datetime', row.updatedAt);
  expect(time).not.toHaveTextContent(row.updatedAt);
});
