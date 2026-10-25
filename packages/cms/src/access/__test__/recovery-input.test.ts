import { expect, test } from 'vitest';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { createAccess } from '../composition.ts';
import { recoveryPageSchema } from '../recovery/contracts.ts';
import { createFixture } from './support.ts';

test('recovery rejects unknown, cross-resource, scope and unsafe offset inputs with field errors', async () => {
  const fixture = await createFixture();
  const invalid = [
    [{}, 'resource'],
    [{ resource: 'roles' }, 'resource'],
    [{ resource: 'bindings', id: 'invalid' }, 'id'],
    [{ resource: 'bindings', permissionId: 'invalid' }, 'permissionId'],
    [{ resource: 'endpoints', status: 'active' }, 'status'],
    [{ resource: 'permissions', operationId: 'permissions.list' }, 'operationId'],
    [{ resource: 'bindings', module: 'access' }, 'module'],
    [{ resource: 'endpoints', q: 'secret' }, 'q'],
    [{ resource: 'permissions', page: '1' }, 'page'],
    [{ resource: 'permissions', page: 0 }, 'page'],
    [{ resource: 'permissions', page: 1.5 }, 'page'],
    [{ resource: 'permissions', page: Number.MAX_SAFE_INTEGER, pageSize: 2 }, 'page'],
    [{ resource: 'permissions', pageSize: 101 }, 'pageSize'],
    [{ resource: 'permissions', status: 'archived' }, 'status'],
    [{ resource: 'permissions', scopeKind: 'unknown' }, 'scopeKind'],
    [{ resource: 'permissions', collectionKey: 'articles' }, 'collectionKey'],
    [{ resource: 'bindings', scopeKind: 'global', collectionKey: 'articles' }, 'collectionKey'],
    [{ resource: 'endpoints', scopeKind: 'collection', collectionKey: 'Unknown' }, 'collectionKey'],
  ] as const;
  for (const [input, field] of invalid) {
    const failure: unknown = await fixture.access.api
      .readRecovery(fixture.owner, input)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CmsError);
    if (!(failure instanceof CmsError)) throw new Error('Expected CMS input error');
    expect(failure).toMatchObject({ code: 'invalid_input', status: 400 });
    expect(failure.fieldErrors?.map((entry) => entry.field)).toContain(field);
  }
});

test('recovery response budget validates configuration and measures serialized UTF-8 including envelope', async () => {
  const fixture = await createFixture();
  for (const recoveryMaxResponseBytes of [
    0,
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    expect(() => createAccess({ ...fixture.accessOptions, recoveryMaxResponseBytes })).toThrow(
      'Invalid recovery response byte budget',
    );
  }
  await fixture.access.api.createPermission(fixture.owner, {
    code: 'unicode:read',
    name: '恢复读取',
    scopeKind: 'global',
  });
  const query = { resource: 'permissions', code: 'unicode:read' };
  const result = await fixture.access.api.readRecovery(fixture.owner, query);
  const bytes = Buffer.byteLength(JSON.stringify(result));
  expect(bytes).toBeGreaterThan(JSON.stringify(result).length);
  const exact = createAccess({ ...fixture.accessOptions, recoveryMaxResponseBytes: bytes });
  await expect(exact.api.readRecovery(fixture.owner, query)).resolves.toEqual(result);
  const limited = createAccess({ ...fixture.accessOptions, recoveryMaxResponseBytes: bytes - 1 });
  await expect(limited.api.readRecovery(fixture.owner, query)).rejects.toMatchObject({
    code: 'capacity_exceeded',
    status: 409,
  });
  expect(recoveryPageSchema.safeParse({ ...result, token: 'private' }).success).toBe(false);
  expect(recoveryPageSchema.safeParse({ ...result, resource: 'bindings' }).success).toBe(false);
});

test('recovery many unknown parameters retain per-field errors without quadratic response amplification', async () => {
  const fixture = await createFixture();
  const sizes: number[] = [];
  for (const count of [500, 100]) {
    const keys = Array.from({ length: count }, (_, index) => `x${String(index).padStart(4, '0')}`);
    const input = { resource: 'permissions', ...Object.fromEntries(keys.map((key) => [key, ''])) };
    const requestBytes = Buffer.byteLength(`/v1/security/recovery?${new URLSearchParams(input)}`);
    expect(requestBytes).toBeLessThanOrEqual(4096);
    const failure: unknown = await fixture.access.api
      .readRecovery(fixture.owner, input)
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CmsError);
    if (!(failure instanceof CmsError)) throw new Error('Expected CMS input error');
    expect(failure).toMatchObject({ code: 'invalid_input', status: 400 });
    expect(failure.fieldErrors?.map((entry) => entry.field)).toEqual(keys);
    const bytes = Buffer.byteLength(
      JSON.stringify({
        error: {
          code: failure.code,
          message: failure.message,
          requestId: fixture.owner.requestId,
          fieldErrors: failure.fieldErrors,
        },
      }),
    );
    console.info('Recovery unknown-parameter response bytes', { count, requestBytes, bytes });
    sizes.push(bytes);
    expect(bytes).toBeLessThan(count * 128);
    expect(failure.fieldErrors?.every((entry) => entry.message.length < 64)).toBe(true);
  }
  const [large, small] = sizes;
  if (small === undefined || large === undefined) throw new Error('Expected both response sizes');
  expect(large).toBeLessThan(small * 6);
});
