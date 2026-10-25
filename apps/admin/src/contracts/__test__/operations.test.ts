import { describe, expect, it } from 'vitest';
import { identityOperations } from '@new-cms/cms/identity';
import { accessOperations } from '@new-cms/cms/access';
import { contentOperations } from '@new-cms/cms/content';
import { assetsOperations } from '@new-cms/cms/assets';
import {
  acceptsIdempotencyKey,
  getOperation,
  matchOperation,
  operationPath,
  operations,
} from '../operations';
import { allowedOperationsSchema, meSchema, myNavigationSchema } from '../auth';

const backend = [
  ...identityOperations,
  ...accessOperations,
  ...contentOperations,
  ...assetsOperations,
];

describe('operation manifest HTTP contract', () => {
  it('covers every actual backend operation exactly once with matching access and idempotency', () => {
    expect(backend).toHaveLength(76);
    expect(
      operations.filter((value) => value.target === 'backend' && value.id !== 'system.openapi'),
    ).toHaveLength(76);
    expect(new Set(operations.map((value) => value.id)).size).toBe(operations.length);
    for (const definition of backend) {
      const operation = operations.find((value) => value.id === definition.id);
      expect(operation).toMatchObject({
        id: definition.id,
        method: definition.method,
        path: definition.path,
        access: definition.access === 'public' ? 'public' : 'protected',
        idempotency: definition.idempotency ?? 'none',
      });
    }
  });

  it('matches encoded safe params and grants HEAD only for private streams', () => {
    const operation = getOperation('documents.get');
    const path = operationPath(
      operation,
      { collection: 'articles', id: 'document_1' },
      { fallback: [], mode: 'editing' },
    );
    expect(path).toBe('/v1/collections/articles/documents/document_1?fallback=%5B%5D&mode=editing');
    expect(matchOperation('GET', path.split('?')[0] ?? '')?.operation.id).toBe('documents.get');
    expect(
      matchOperation('HEAD', '/v1/collections/media/documents/file_1/file')?.operation.id,
    ).toBe('assets.download');
    expect(matchOperation('HEAD', '/v1/me')).toBeNull();
    expect(matchOperation('POST', '/api/auth/expired-session')).toBeNull();
    expect(operationPath(getOperation('session.expire'))).toBe('/api/auth/expired-session');
  });

  it.each(['../me', 'a/b', 'a\\b', 'a%2fb', '.', '', 'a b', 'http:host'])(
    'rejects unsafe parameter %s',
    (id) => {
      expect(() => operationPath(getOperation('admins.get'), { id })).toThrow('Invalid');
    },
  );

  it.each(['/v1/me/', '/v1/%6de', '/v1//me', '/v1/../me', '/v1/me?x=1', '//host/v1/me'])(
    'rejects unmatched or encoded path %s',
    (path) => {
      expect(matchOperation('GET', path)).toBeNull();
    },
  );

  it('rejects parameter confusion and unsupported query values', () => {
    expect(() => operationPath(getOperation('admins.get'))).toThrow('Invalid');
    expect(() => operationPath(getOperation('admins.get'), { id: 'x', extra: 'y' })).toThrow(
      'Invalid',
    );
    expect(() => operationPath(getOperation('roles.list'), {}, { status: 'active' })).toThrow(
      'Invalid',
    );
    expect(() => operationPath(getOperation('roles.list'), {}, { page: undefined })).toThrow(
      'Invalid',
    );
    expect(() => operationPath(getOperation('roles.list'), {}, { page: Infinity })).toThrow(
      'Invalid',
    );
    expect(() => operationPath(getOperation('roles.list'), {}, { page: {} })).toThrow('Invalid');
    expect(
      operationPath(
        getOperation('documents.list'),
        { collection: 'media' },
        { trashed: true, folderId: null, depth: 0 },
      ),
    ).toContain('trashed=true&folderId=null&depth=0');
  });

  it('validates idempotency using the backend 16 through 128 printable ASCII contract', () => {
    const create = getOperation('admins.create');
    expect(acceptsIdempotencyKey(create, 'valid key with spaces')).toBe(true);
    expect(acceptsIdempotencyKey(create, 'x'.repeat(16))).toBe(true);
    expect(acceptsIdempotencyKey(create, 'x'.repeat(128))).toBe(true);
    for (const key of [
      undefined,
      'x'.repeat(15),
      'x'.repeat(129),
      'contains-newline\n',
      'non-ascii-你好你好你好',
    ])
      expect(acceptsIdempotencyKey(create, key)).toBe(false);
    expect(acceptsIdempotencyKey(getOperation('identity.login'), 'x'.repeat(16))).toBe(false);
  });

  it('exposes browser projections that remove undeclared sensitive fields', () => {
    expect(meSchema.safeParse({ token: 'secret' }).success).toBe(false);
    expect(
      allowedOperationsSchema.parse({
        rows: [{ operationId: 'x', scopeKind: 'global', collectionKey: null, token: 'secret' }],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    ).toEqual({
      rows: [{ operationId: 'x', scopeKind: 'global', collectionKey: null }],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    expect(
      myNavigationSchema.parse({
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            type: 'group',
            name: 'Root',
            path: null,
            icon: null,
            children: [],
            token: 'secret',
          },
        ],
      }).rows[0],
    ).not.toHaveProperty('token');
  });
});
