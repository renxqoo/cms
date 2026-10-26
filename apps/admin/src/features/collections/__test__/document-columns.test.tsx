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
