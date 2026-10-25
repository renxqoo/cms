import { expect, it } from 'vitest';
import {
  managementNavigation,
  managementPermission,
} from '../../../../../../test/support/admin-management';
import {
  changeNodeType,
  flattenNavigation,
  navigationChanges,
  navigationDraft,
  navigationValues,
} from '../navigation-model';
import { navigationQueryHref, parseNavigationQuery } from '../navigation-query';

const group = managementNavigation();
const page = managementNavigation({
  id: '77777777-7777-4777-8777-777777777777',
  type: 'page',
  name: 'Roles',
  parentId: group.id,
  path: '/dashboard/roles',
  visibility: 'authenticated',
});

it('preserves tree depth and inherited disabled status without making action nodes into links', () => {
  const action = managementNavigation({
    id: '88888888-8888-4888-8888-888888888888',
    type: 'action',
    name: 'Create',
    parentId: page.id,
    visibility: 'authenticated',
  });
  const rows = flattenNavigation([
    { ...group, status: 'disabled', children: [{ ...page, children: [action] }] },
  ]);
  expect(
    rows.map(({ node, depth, ancestorDisabled }) => [node.name, depth, ancestorDisabled]),
  ).toEqual([
    ['Management', 0, false],
    ['Roles', 1, true],
    ['Create', 2, true],
  ]);
  expect(rows[2]?.node.path).toBeNull();
});

it('resets target and visibility state when changing node type while retaining presentation fields', () => {
  const value = changeNodeType(
    {
      ...navigationDraft(page),
      name: 'Kept',
      sortOrder: '12',
      icon: 'shield',
      permissionId: managementPermission().id,
    },
    'action',
  );
  expect(value).toMatchObject({
    name: 'Kept',
    sortOrder: '12',
    type: 'action',
    parentId: '',
    path: '',
    icon: '',
    visibility: 'authenticated',
    permissionId: '',
  });
  expect(changeNodeType(value, 'group').visibility).toBe('container');
  expect(navigationDraft(null)).toMatchObject({
    type: 'group',
    parentId: '',
    sortOrder: '0',
    status: 'active',
  });
});

it('enforces registered targets, exact hierarchy and explicit active permission selection', () => {
  const nodes = flattenNavigation([{ ...group, children: [page] }]);
  const draft = { ...navigationDraft(page), icon: 'shield', name: ' Roles ' };
  expect(navigationValues(draft, nodes, [])?.name).toBe('Roles');
  expect(navigationValues({ ...draft, parentId: '', path: '/outside' }, nodes, [])).toBeNull();
  expect(navigationValues({ ...draft, icon: 'unregistered' }, nodes, [])).toBeNull();
  expect(
    navigationValues(
      { ...draft, visibility: 'permission', permissionId: managementPermission().id },
      nodes,
      null,
    ),
  ).toBeNull();
  expect(
    navigationValues(
      { ...draft, visibility: 'permission', permissionId: managementPermission().id },
      nodes,
      [managementPermission({ status: 'disabled' })],
    ),
  ).toBeNull();
  expect(
    navigationValues(
      { ...draft, visibility: 'permission', permissionId: managementPermission().id },
      nodes,
      [managementPermission()],
    )?.permissionId,
  ).toBe('22222222-2222-4222-8222-222222222222');
  expect(navigationValues({ ...draft, visibility: 'container' }, nodes, [])).toBeNull();
  expect(
    navigationValues({ ...draft, permissionId: managementPermission().id }, nodes, [
      managementPermission(),
    ]),
  ).toBeNull();
});

it('rejects invalid group shape, action targets and numeric bounds', () => {
  const nodes = flattenNavigation([{ ...group, children: [page] }]);
  expect(navigationValues(navigationDraft(group), nodes, [])?.type).toBe('group');
  expect(
    navigationValues({ ...navigationDraft(group), icon: 'not-registered' }, nodes, []),
  ).toBeNull();
  expect(navigationValues({ ...navigationDraft(group), parentId: page.id }, nodes, [])).toBeNull();
  expect(
    navigationValues({ ...navigationDraft(group), name: ' ', sortOrder: '2147483648' }, nodes, []),
  ).toBeNull();
  const action = {
    ...navigationDraft(null),
    type: 'action' as const,
    parentId: page.id,
    name: 'Action',
    visibility: 'authenticated' as const,
  };
  expect(navigationValues(action, nodes, [])?.path).toBeNull();
  expect(navigationValues({ ...action, icon: 'key' }, nodes, [])).toBeNull();
  expect(navigationValues({ ...action, parentId: group.id }, nodes, [])).toBeNull();
});

it('does not forward immutable or unchanged data in a node patch and keeps local list query separate from API input', () => {
  const before = {
    ...navigationDraft(group),
    name: 'Changed',
    sortOrder: '10',
    status: 'disabled' as const,
  };
  const parsed = navigationValues(before, [], []);
  if (!parsed) throw new Error('Expected valid node');
  expect(navigationChanges(group, parsed)).toEqual({
    name: 'Changed',
    sortOrder: 10,
    status: 'disabled',
  });
  const query = parseNavigationQuery(
    new URLSearchParams('q=Manage&page=5&pageSize=10&sortBy=name&secret=x'),
  );
  expect(query).toEqual({ q: 'Manage', page: 5, pageSize: 10 });
  const href = new URL(
    navigationQueryHref(new URLSearchParams('page=5&q=old'), { q: 'new' }),
    'http://localhost',
  );
  expect(href.searchParams.get('page')).toBe('1');
  expect(href.searchParams.has('sortBy')).toBe(false);
});
