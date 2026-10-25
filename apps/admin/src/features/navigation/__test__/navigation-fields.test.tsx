import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NavigationFields } from '../navigation-fields';
import { navigationDraft } from '../navigation-model';
import type { NavigationDraft } from '../navigation-model';
import type { NavigationTree } from '../../../contracts/access';

const group: NavigationTree = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  name: 'Existing group',
  type: 'group',
  parentId: null,
  path: null,
  icon: null,
  sortOrder: 0,
  status: 'active',
  visibility: 'container',
  permissionId: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  children: [],
};

it('regression: an existing root group must not prevent choosing a type for a new node', () => {
  render(
    <NavigationFields
      value={navigationDraft(null)}
      onChange={vi.fn<(value: NavigationDraft) => void>()}
      nodes={[{ node: group, depth: 0, ancestorDisabled: false }]}
      permissions={[]}
      currentId={null}
      creating
      locale="en"
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Type' })).toBeEnabled();
});
