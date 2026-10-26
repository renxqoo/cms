import { expect, it } from 'vitest';
import {
  blockedGrantIds,
  createRoleSchema,
  metadataChanges,
  roleFormValues,
  roleValuesSchema,
  sameGrants,
} from '../role-model';
import type { Permission } from '../../../contracts/access';

function permission(id: string, status: 'active' | 'disabled'): Permission {
  return {
    id,
    status,
    code: 'content:read',
    name: 'Read content',
    description: null,
    scopeKind: 'global',
    collectionKey: null,
    version: 1,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  };
}

it('sends only actual metadata changes and never fabricates a version increment', () => {
  const before = { name: 'Editor', description: null, status: 'active' as const };
  expect(metadataChanges(before, { ...before })).toEqual({});
  expect(
    metadataChanges(before, { name: 'Reviewer', description: 'Review', status: 'disabled' }),
  ).toEqual({ name: 'Reviewer', description: 'Review', status: 'disabled' });
});

it('compares grants as a complete unique set without depending on display order', () => {
  expect(sameGrants(['one', 'two'], ['two', 'one'])).toBe(true);
  expect(sameGrants(['one', 'one'], ['one', 'two'])).toBe(false);
  expect(sameGrants(['one'], ['one', 'two'])).toBe(false);
  expect(sameGrants([], [])).toBe(true);
});

it('requires explicit removal of disabled and unavailable selected grants', () => {
  expect(
    blockedGrantIds(
      ['active', 'disabled', 'missing'],
      [permission('active', 'active'), permission('disabled', 'disabled')],
    ),
  ).toEqual(['disabled', 'missing']);
});

it.each(['super_admin', 'Uppercase', 'a:b', '', '1editor'])(
  'rejects an invalid or reserved role code %s before creating',
  (code) => {
    expect(createRoleSchema.safeParse({ code, name: 'Editor', description: null }).success).toBe(
      false,
    );
  },
);

it('normalizes names while preserving description content and enforces field limits', () => {
  expect(
    createRoleSchema.parse({ code: 'editor_v2', name: ' Editor ', description: '  spaces  ' }),
  ).toEqual({ code: 'editor_v2', name: 'Editor', description: '  spaces  ' });
  expect(
    roleValuesSchema.safeParse({ name: ' ', description: null, status: 'active' }).success,
  ).toBe(false);
  expect(
    roleValuesSchema.safeParse({ name: 'Editor', description: 'x'.repeat(513), status: 'active' })
      .success,
  ).toBe(false);
});

it('reads actual form values without trimming descriptions or trusting file entries', () => {
  const form = new FormData();
  form.set('name', 'Editor');
  form.set('description', '  description  ');
  form.set('status', 'disabled');
  expect(roleFormValues(form)).toEqual({
    name: 'Editor',
    description: '  description  ',
    status: 'disabled',
  });
  form.delete('description');
  form.set('name', new File(['data'], 'name.txt'));
  expect(roleFormValues(form)).toEqual({ name: '', description: null, status: 'disabled' });
  expect(roleFormValues(new FormData()).status).toBe('active');
});
