import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '@new-cms/ui/data';
import { documentColumns } from '../document-columns';
import { contentMessages } from '../messages';
import { catalog, document, versionId, nextVersionId } from './support';

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

it.each([
  { mode: 'editing', direct: false, published: null, trashed: null, expected: 'Draft' },
  { mode: 'editing', direct: false, published: versionId, trashed: null, expected: 'Published' },
  {
    mode: 'editing',
    direct: false,
    published: nextVersionId,
    trashed: null,
    expected: 'Unpublished changes',
  },
  {
    mode: 'published',
    direct: false,
    published: versionId,
    trashed: null,
    expected: 'Published snapshot',
  },
  { mode: 'editing', direct: true, published: versionId, trashed: null, expected: 'Active' },
  {
    mode: 'editing',
    direct: true,
    published: versionId,
    trashed: '2026-10-27T00:00:00Z',
    expected: 'Trash',
  },
])(
  'shows $expected for the actual collection and snapshot mode',
  ({ mode, direct, published, trashed, expected }) => {
    render(
      <DataTable
        columns={documentColumns({
          collection: catalog({ mode: direct ? 'direct' : 'drafts' }),
          t: contentMessages.en,
          locale: 'en',
          selected: [],
          select: () => {},
          visible: [],
          trashed: trashed !== null,
          open: () => {},
          trash: () => {},
          canRestore: false,
          canPurge: false,
          mode,
        })}
        rows={[document({ publishedVersionId: published, trashedAt: trashed })]}
        rowKey={(row) => row.id}
        emptyLabel="Empty"
        loadingLabel="Loading"
      />,
    );
    expect(screen.getByText(expected, { exact: true })).toBeInTheDocument();
  },
);

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
