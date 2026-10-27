import { collection, record, resetPageApi } from './page-fixture';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentAuthors } from '../document-authors';
import { filterFromDraft, validateFilter, filterOperators } from '../query-filter';
import { filterFields } from '../author-metadata';

const creator = '11111111-1111-4111-8111-111111111111';
const updater = '22222222-2222-4222-8222-222222222222';
const configured = {
  ...collection,
  authorship: { createdBy: true, updatedBy: true, queryable: true },
};
beforeEach(resetPageApi);
afterEach(cleanup);

it('shows only the safe server-projected author names and UUIDs to an authorized viewer', () => {
  renderManagement(
    <DocumentAuthors
      collection={configured}
      document={{
        ...record(),
        createdBy: { id: creator, displayName: 'Original author' },
        updatedBy: { id: updater, displayName: 'Last editor' },
      }}
    />,
  );
  expect(screen.getByText('Original author')).toBeVisible();
  expect(screen.getByText('Last editor')).toBeVisible();
  expect(screen.getByText(creator)).toBeVisible();
  expect(screen.getByText(updater)).toBeVisible();
});
it('hides identity UI without read permission and preserves unknown legacy authors as unknown', () => {
  const view = renderManagement(
    <DocumentAuthors
      collection={{ ...configured, authorship: { ...configured.authorship, queryable: false } }}
      document={record()}
    />,
  );
  expect(screen.queryByText('Authorship')).not.toBeInTheDocument();
  view.unmount();
  renderManagement(
    <DocumentAuthors
      collection={{
        ...configured,
        authorship: { createdBy: true, updatedBy: false, queryable: true },
      }}
      document={{ ...record(), createdBy: null }}
    />,
  );
  expect(screen.getByText('Not available')).toBeVisible();
  expect(screen.queryByText('Last updated by')).not.toBeInTheDocument();
});
it('offers only authorized author UUID metadata conditions and refuses identity dot paths', () => {
  const field = filterFields(configured).find((entry) => entry.path === 'createdBy');
  expect(filterOperators(field)).toEqual(['eq', 'ne', 'in', 'notIn', 'exists']);
  expect(
    filterFromDraft(
      { kind: 'condition', field: 'createdBy', operator: 'eq', value: creator },
      configured,
    ),
  ).toEqual({ field: 'createdBy', operator: 'eq', value: creator });
  expect(
    validateFilter({ field: 'createdBy', operator: 'in', value: [creator, updater] }, configured),
  ).toBe(true);
  expect(
    validateFilter(
      { field: 'createdBy.email', operator: 'eq', value: 'private@example.test' },
      configured,
    ),
  ).toBe(false);
  expect(
    validateFilter(
      { field: 'createdBy', operator: 'eq', value: creator },
      { ...configured, authorship: { createdBy: false, updatedBy: true, queryable: true } },
    ),
  ).toBe(false);
});
