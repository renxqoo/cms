import { expect, it } from 'vitest';
import {
  managementEndpoint,
  managementPermission,
} from '../../../../../../test/support/admin-management';
import {
  createPermissionSchema,
  eligiblePermissions,
  permissionChanges,
  permissionValuesSchema,
} from '../permission-model';
import { parsePermissionQuery, permissionQueryHref } from '../permission-query';

it('offers only active permissions matching both scope kind and collection key', () => {
  const rows = [
    managementPermission(),
    managementPermission({ id: 'disabled', status: 'disabled' }),
    managementPermission({ id: 'articles', scopeKind: 'collection', collectionKey: 'articles' }),
    managementPermission({ id: 'pages', scopeKind: 'collection', collectionKey: 'pages' }),
  ];
  expect(eligiblePermissions(managementEndpoint(), rows).map((value) => value.id)).toEqual([
    '22222222-2222-4222-8222-222222222222',
  ]);
  expect(
    eligiblePermissions(
      managementEndpoint({ scopeKind: 'collection', collectionKey: 'articles' }),
      rows,
    ).map((value) => value.id),
  ).toEqual(['articles']);
});

it('validates permission code and scope while preserving nullable metadata and immutable fields', () => {
  const global = {
    code: 'content:read',
    name: 'Read',
    description: null,
    scopeKind: 'global',
    collectionKey: null,
  };
  expect(createPermissionSchema.safeParse(global).success).toBe(true);
  expect(createPermissionSchema.safeParse({ ...global, code: 'read' }).success).toBe(false);
  expect(createPermissionSchema.safeParse({ ...global, scopeKind: 'collection' }).success).toBe(
    false,
  );
  expect(createPermissionSchema.safeParse({ ...global, collectionKey: 'articles' }).success).toBe(
    false,
  );
  expect(
    createPermissionSchema.safeParse({
      ...global,
      scopeKind: 'collection',
      collectionKey: 'articles',
    }).success,
  ).toBe(true);
  const permission = managementPermission();
  expect(
    permissionChanges(permission, { name: permission.name, description: null, status: 'active' }),
  ).toEqual({});
  expect(
    permissionChanges(permission, {
      name: 'New name',
      description: 'Description',
      status: 'disabled',
    }),
  ).toEqual({ name: 'New name', description: 'Description', status: 'disabled' });
  expect(
    permissionValuesSchema.safeParse({ name: ' ', description: null, status: 'active' }).success,
  ).toBe(false);
});

it('keeps permission filters in the allowed whitelist and drops collection keys for global scope', () => {
  const query = parsePermissionQuery(
    new URLSearchParams(
      'status=disabled&scopeKind=collection&collectionKey=articles&q=read&page=2',
    ),
  );
  expect(query.status).toBe('disabled');
  expect(query.collectionKey).toBe('articles');
  const next = new URL(
    permissionQueryHref(
      new URLSearchParams('status=disabled&scopeKind=collection&collectionKey=articles&page=3'),
      { scopeKind: 'global', status: undefined },
    ),
    'http://localhost',
  ).searchParams;
  expect(next.has('collectionKey')).toBe(false);
  expect(next.has('status')).toBe(false);
  expect(next.get('page')).toBe('1');
  expect(
    parsePermissionQuery(
      new URLSearchParams('scopeKind=bad&status=deleted&collectionKey=invalid..'),
    ).scopeKind,
  ).toBeUndefined();
  expect(
    parsePermissionQuery(new URLSearchParams('scopeKind=global&collectionKey=articles'))
      .collectionKey,
  ).toBeUndefined();
});
