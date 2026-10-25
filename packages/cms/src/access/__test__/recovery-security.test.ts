import { expect, test, vi } from 'vitest';
import type { Database } from '@new-cms/database/client';
import { createAccess } from '../composition.ts';
import { createFixture, context, invite, permission, role, password } from './support.ts';
import type { Fixture } from './support.ts';

async function expectWaiter(fixture: Fixture) {
  await vi.waitFor(
    async () => {
      const waiting = await fixture.database.query<{ count: string }>(
        "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=$1::oid AND NOT granted",
        [fixture.policy.securityLockKey],
      );
      expect(Number(waiting.rows[0]?.count)).toBe(1);
    },
    { timeout: 1000, interval: 10 },
  );
}

test('recovery requires current active super despite normal permission grants and collection query filters', async () => {
  const fixture = await createFixture();
  const grants = await fixture.access.api.listPermissions(fixture.owner, { pageSize: 100 });
  const regular = await role(fixture, {
    code: 'regular',
    permissionIds: grants.rows.map((grant) => grant.id),
  });
  const editor = await invite(fixture, { email: 'editor@example.test', roleId: regular.id });
  for (const resource of ['endpoints', 'bindings', 'permissions']) {
    await expect(
      fixture.access.api.readRecovery(editor.ctx, {
        resource,
        scopeKind: 'collection',
        collectionKey: 'articles',
      }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(fixture.access.api.readRecovery(context(), { resource })).rejects.toMatchObject({
      code: 'unauthenticated',
      status: 401,
    });
  }
  const grant = await permission(fixture, { code: 'fake:recovery' });
  await expect(
    fixture.access.api.createBinding(context(fixture.owner.token), {
      operationId: 'access.readRecovery',
      scopeKind: 'global',
      permissionId: grant.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const superAdmin = await invite(fixture, {
    email: 'super@example.test',
    roleId: fixture.admin.roleId,
  });
  await fixture.access.api.updateAdmin(fixture.owner, {
    id: superAdmin.admin.id,
    version: superAdmin.admin.version,
    roleId: regular.id,
  });
  await expect(
    fixture.access.api.readRecovery(superAdmin.ctx, { resource: 'permissions' }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  const login = await fixture.identity.api.login(context(), {
    email: superAdmin.admin.email,
    password,
  });
  await expect(
    fixture.access.api.readRecovery(context(login.token), { resource: 'permissions' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

test('recovery rejects disabled and archived accounts, expired and revoked sessions with unauthenticated', async () => {
  const fixture = await createFixture();
  for (const status of ['disabled', 'archived']) {
    const superAdmin = await invite(fixture, {
      email: `${status}@example.test`,
      roleId: fixture.admin.roleId,
    });
    await fixture.access.api.updateAdmin(fixture.owner, {
      id: superAdmin.admin.id,
      version: superAdmin.admin.version,
      status,
    });
    await expect(
      fixture.access.api.readRecovery(superAdmin.ctx, { resource: 'permissions' }),
    ).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
  }
  const expired = await invite(fixture, {
    email: 'expired@example.test',
    roleId: fixture.admin.roleId,
  });
  await fixture.database.query(
    "UPDATE sessions SET created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' WHERE admin_id=$1",
    [expired.admin.id],
  );
  await expect(
    fixture.access.api.readRecovery(expired.ctx, { resource: 'endpoints' }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
  const revoked = await invite(fixture, {
    email: 'revoked@example.test',
    roleId: fixture.admin.roleId,
  });
  await fixture.identity.api.logout(revoked.ctx, {});
  await expect(
    fixture.access.api.readRecovery(revoked.ctx, { resource: 'bindings' }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
});

test('recovery queued behind a security writer reauthorizes after committed super revocation', async () => {
  const fixture = await createFixture();
  const regular = await role(fixture, { code: 'regular' });
  const target = await invite(fixture, {
    email: 'revoked-super@example.test',
    roleId: fixture.admin.roleId,
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writer = fixture.database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [fixture.policy.securityLockKey]);
    await tx.query('UPDATE admins SET role_id=$2,version=version+1 WHERE id=$1', [
      target.admin.id,
      regular.id,
    ]);
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const read = fixture.access.api.readRecovery(target.ctx, { resource: 'permissions' });
  const checked = read.catch((error: unknown) => error);
  try {
    await expectWaiter(fixture);
  } finally {
    release.resolve();
    await writer;
  }
  expect(await checked).toMatchObject({ code: 'forbidden' });
});

test('recovery holds shared security lock until read completes so a revoking writer waits', async () => {
  const fixture = await createFixture();
  const regular = await role(fixture, { code: 'regular' });
  const target = await invite(fixture, {
    email: 'ordered-super@example.test',
    roleId: fixture.admin.roleId,
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const database: Database = {
    ...fixture.database,
    transaction: (work, signal) =>
      fixture.database.transaction(
        (tx) =>
          work({
            async query<R extends Record<string, unknown>>(text: string, values?: unknown[]) {
              const result = await tx.query<R>(text, values);
              if (text.includes('WITH filtered')) {
                entered.resolve();
                await release.promise;
              }
              return result;
            },
          }),
        signal,
      ),
  };
  const access = createAccess({ ...fixture.accessOptions, database });
  const read = access.api.readRecovery(target.ctx, { resource: 'permissions' });
  await entered.promise;
  const writer = fixture.access.api.updateAdmin(context(fixture.owner.token), {
    id: target.admin.id,
    version: target.admin.version,
    roleId: regular.id,
  });
  try {
    await expectWaiter(fixture);
  } finally {
    release.resolve();
  }
  await expect(read).resolves.toMatchObject({ resource: 'permissions' });
  await writer;
  await expect(
    fixture.access.api.readRecovery(target.ctx, { resource: 'permissions' }),
  ).rejects.toMatchObject({ code: 'unauthenticated' });
});

test('recovery cancellation releases its waiting lock and cannot leave business writes', async () => {
  const fixture = await createFixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writer = fixture.database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [fixture.policy.securityLockKey]);
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const controller = new AbortController();
  const read = fixture.access.api.readRecovery(
    { ...fixture.owner, signal: controller.signal },
    { resource: 'permissions' },
  );
  const checked = read.catch((error: unknown) => error);
  try {
    await expectWaiter(fixture);
    controller.abort();
    expect(await checked).toMatchObject({ code: 'temporarily_unavailable' });
  } finally {
    release.resolve();
    await writer;
  }
  await expect(
    fixture.access.api.readRecovery(fixture.owner, { resource: 'permissions' }),
  ).resolves.toHaveProperty('rows');
  const aborted = AbortSignal.abort();
  await expect(
    fixture.access.api.readRecovery(
      { ...fixture.owner, signal: aborted },
      { resource: 'bindings' },
    ),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});

test('recovery performs no RBAC, audit or idempotency writes across all resources', async () => {
  const fixture = await createFixture();
  const sql = `SELECT jsonb_build_object(
    'permissions',(SELECT jsonb_agg(p ORDER BY id) FROM permissions p),
    'bindings',(SELECT jsonb_agg(b ORDER BY id) FROM endpoint_bindings b),
    'roles',(SELECT jsonb_agg(r ORDER BY id) FROM roles r),
    'rolePermissions',(SELECT jsonb_agg(rp ORDER BY role_id,permission_id) FROM role_permissions rp),
    'navigation',(SELECT jsonb_agg(n ORDER BY id) FROM navigation_nodes n),
    'catalog',(SELECT jsonb_agg(c ORDER BY operation_id) FROM operation_catalog c),
    'audit',(SELECT jsonb_agg(a ORDER BY id) FROM audit_events a),
    'idempotency',(SELECT jsonb_agg(i ORDER BY key) FROM idempotency_records i)) AS snapshot`;
  const before = await fixture.database.query(sql);
  for (const resource of ['endpoints', 'bindings', 'permissions']) {
    await fixture.access.api.readRecovery(
      {
        requestId: fixture.owner.requestId,
        ip: fixture.owner.ip,
        ...(fixture.owner.token ? { token: fixture.owner.token } : {}),
      },
      { resource },
    );
  }
  expect((await fixture.database.query(sql)).rows).toEqual(before.rows);
});
