import { expect, it } from 'vitest';
import { createAdminInput, editAdminInput, editValues } from '../admin-input';
import { adminApiQuery, parseAdminQuery, updateAdminQuery } from '../admins-query';
import { patchMatches } from '../admin-editor-state';
import { roles, subject } from './support';

function values(input: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.set(key, value);
  return data;
}

it('normalizes new admin email while preserving display name whitespace and selecting a current active role', () => {
  const result = createAdminInput(
    values({
      email: '  New@Example.Test  ',
      displayName: '  New name  ',
      roleId: roles[0]?.id ?? '',
    }),
    roles,
  );
  expect(result).toMatchObject({
    valid: true,
    body: { email: 'new@example.test', displayName: '  New name  ', roleId: subject.roleId },
  });
});

it('allows an empty display name as null and rejects malformed, disabled or unlisted roles', () => {
  const base = { email: 'new@example.test', displayName: '' };
  expect(createAdminInput(values({ ...base, roleId: subject.roleId }), roles)).toMatchObject({
    valid: true,
    body: { displayName: null },
  });
  expect(createAdminInput(values({ ...base, roleId: 'invalid' }), roles).errors).toEqual({
    roleId: 'roleInvalid',
  });
  expect(
    createAdminInput(values({ ...base, roleId: subject.roleId }), [
      {
        ...roles[0],
        id: subject.roleId,
        version: 1,
        code: 'editor',
        name: 'Editors',
        description: null,
        status: 'disabled',
        isSuper: false,
        adminCount: 1,
        permissionCount: 2,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
      },
    ]).errors,
  ).toEqual({ roleId: 'roleInvalid' });
  expect(createAdminInput(values({ ...base, roleId: actorId }), roles).errors).toEqual({
    roleId: 'roleInvalid',
  });
});
const actorId = '10000000-0000-4000-8000-000000000001';

it('reports invalid create fields together instead of sending an invalid payload', () => {
  expect(
    createAdminInput(values({ email: 'bad', displayName: 'x'.repeat(65), roleId: '' }), roles),
  ).toMatchObject({
    valid: false,
    errors: { email: 'emailInvalid', displayName: 'nameInvalid', roleId: 'roleInvalid' },
  });
});

it('omits unchanged role and status so a disabled assigned role does not block a name edit', () => {
  const result = editAdminInput({
    current: subject,
    principalId: actorId,
    roles: [],
    data: values({ displayName: 'Changed name', roleId: subject.roleId, status: subject.status }),
  });
  expect(result).toMatchObject({
    valid: true,
    changed: true,
    revokes: false,
    body: { version: 7, displayName: 'Changed name' },
  });
  expect(result.body).not.toHaveProperty('roleId');
  expect(result.body).not.toHaveProperty('status');
});

it('keeps disabled or omitted controls at the confirmed snapshot value', () => {
  expect(
    editAdminInput({
      current: subject,
      principalId: actorId,
      roles: [],
      data: values({ displayName: subject.displayName ?? '' }),
    }),
  ).toMatchObject({ valid: true, changed: false, body: { version: 7 } });
  expect(editValues({ ...subject, displayName: null }).displayName).toBe('');
});

it('clears names with null and requests revocation only when the role or status actually changes', () => {
  expect(
    editAdminInput({
      current: subject,
      principalId: actorId,
      roles,
      data: values({ displayName: '', roleId: roles[1]?.id ?? '', status: 'disabled' }),
    }),
  ).toMatchObject({
    valid: true,
    changed: true,
    revokes: true,
    body: { version: 7, displayName: null, roleId: roles[1]?.id, status: 'disabled' },
  });
});

it('rejects own role and status edits even if a caller injects disabled controls', () => {
  expect(
    editAdminInput({
      current: subject,
      principalId: subject.id,
      roles,
      data: values({ displayName: 'Own name', roleId: roles[1]?.id ?? '', status: 'disabled' }),
    }),
  ).toMatchObject({
    valid: false,
    errors: { roleId: 'ownProtected', status: 'ownProtected' },
    body: { version: 7, displayName: 'Own name' },
  });
});

it.each(['unknown', 'active', 'disabled'])(
  'does not restore an archived account to %s',
  (status) => {
    expect(
      editAdminInput({
        current: { ...subject, status: 'archived' },
        principalId: actorId,
        roles,
        data: values({ displayName: 'Archived name', status }),
      }),
    ).toMatchObject({ valid: false, errors: { status: 'statusInvalid' } });
  },
);

it('rejects an invalid changed role, status and overlong name', () => {
  expect(
    editAdminInput({
      current: subject,
      principalId: actorId,
      roles,
      data: values({ displayName: 'x'.repeat(65), status: 'unknown', roleId: actorId }),
    }),
  ).toMatchObject({
    valid: false,
    errors: { displayName: 'nameInvalid', status: 'statusInvalid', roleId: 'roleInvalid' },
  });
});

it('compares only the actual patch fields when reconciling an unknown response', () => {
  expect(
    patchMatches(
      { version: 7, displayName: null },
      { ...subject, displayName: null, roleCode: 'different' },
    ),
  ).toBe(true);
  expect(patchMatches({ version: 7, displayName: 'new' }, subject)).toBe(false);
  expect(patchMatches({ version: 7, roleId: actorId }, subject)).toBe(false);
  expect(patchMatches({ version: 7, status: 'disabled' }, subject)).toBe(false);
});

it('sanitizes list page bounds and invalid filters while keeping explicit valid sort and search values', () => {
  expect(
    parseAdminQuery(
      new URLSearchParams(
        'page=-1&pageSize=101&status=bad&activation=bad&sortBy=version&order=bad',
      ),
    ),
  ).toMatchObject({
    page: 1,
    pageSize: 20,
    status: 'all',
    activation: 'all',
    sortBy: 'createdAt',
    order: 'desc',
  });
  expect(
    parseAdminQuery(
      new URLSearchParams(
        'page=3&pageSize=50&status=archived&activation=pending&sortBy=email&order=asc&q=%25_%5C',
      ),
    ),
  ).toMatchObject({
    page: 3,
    pageSize: 50,
    status: 'archived',
    activation: 'pending',
    sortBy: 'email',
    order: 'asc',
    q: '%_\\',
  });
});

it('sends only allowed list parameters and resets page after a search or sort change', () => {
  const href = updateAdminQuery(
    new URLSearchParams('page=9&pageSize=50&status=disabled&where=private'),
    { q: 'user', sort: { key: 'lastLoginAt', direction: 'asc' } },
  );
  const result = new URL(href, 'https://example.test');
  expect(result.pathname).toBe('/dashboard/admins');
  expect(Object.fromEntries(result.searchParams)).toEqual({
    page: '1',
    pageSize: '50',
    q: 'user',
    sortBy: 'lastLoginAt',
    order: 'asc',
    status: 'disabled',
  });
  const cleared = parseAdminQuery(
    new URL(updateAdminQuery(result.searchParams, { page: 4, sort: null }), 'https://example.test')
      .searchParams,
  );
  expect(adminApiQuery(cleared)).toEqual({
    page: 4,
    pageSize: 50,
    q: 'user',
    sortBy: 'createdAt',
    order: 'desc',
    status: 'disabled',
  });
});
