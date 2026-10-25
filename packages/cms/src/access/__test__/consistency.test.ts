import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import type { Fixture } from './support.ts';
import { createFixture, context, invite, password, permission, role } from './support.ts';

function deferred() {
  const resolvers: (() => void)[] = [];
  const promise = new Promise<void>((resolve) => {
    resolvers.push(resolve);
  });
  return {
    promise,
    resolve() {
      const [resolve] = resolvers;
      if (!resolve) throw new Error('Resolver missing');
      resolve();
    },
  };
}

async function competingWriters<T>(fixture: Fixture, work: () => Promise<T>) {
  const entered = deferred();
  const release = deferred();
  const blocker = fixture.database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [fixture.policy.securityLockKey]);
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const result = work();
  try {
    await vi.waitFor(
      async () => {
        const waiting = await fixture.database.query<{ count: string }>(
          'SELECT count(*) FROM pg_locks WHERE locktype=$1 AND classid=0 AND objid=$2::oid AND NOT granted',
          ['advisory', fixture.policy.securityLockKey],
        );
        expect(Number(waiting.rows[0]?.count)).toBe(2);
      },
      { timeout: 1000, interval: 10 },
    );
  } finally {
    release.resolve();
    await blocker;
  }
  return result;
}

test('two super administrators concurrently disabling each other retain one active activated super', async () => {
  const fixture = await createFixture();
  const second = await invite(fixture, {
    email: 'second-super@example.test',
    roleId: fixture.admin.roleId,
  });
  const results = await competingWriters(fixture, () =>
    Promise.allSettled([
      fixture.access.api.updateAdmin(fixture.owner, {
        id: second.admin.id,
        version: second.admin.version,
        status: 'disabled',
      }),
      fixture.access.api.updateAdmin(second.ctx, {
        id: fixture.admin.id,
        version: fixture.admin.version,
        status: 'disabled',
      }),
    ]),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  const count = await fixture.database.query<{ count: string }>(
    "SELECT count(*) FROM admins a JOIN credentials c ON c.admin_id=a.id JOIN roles r ON r.id=a.role_id WHERE a.status='active' AND r.status='active' AND r.is_super",
  );
  expect(Number(count.rows[0]?.count)).toBe(1);
});

test('role metadata and full grant replacement competing at one version allow exactly one commit', async () => {
  const fixture = await createFixture();
  const grant = await permission(fixture, { code: 'sample:read' });
  const editor = await role(fixture, { code: 'editor' });
  const results = await competingWriters(fixture, () =>
    Promise.allSettled([
      fixture.access.api.updateRole(fixture.owner, { id: editor.id, version: 1, name: 'Revised' }),
      fixture.access.api.replaceRolePermissions(fixture.owner, {
        id: editor.id,
        version: 1,
        permissionIds: [grant.id],
      }),
    ]),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 'version_conflict' },
  });
  const current = await fixture.access.api.getRole(fixture.owner, { id: editor.id });
  expect(current.version).toBe(2);
  expect([
    { name: 'Revised', permissionIds: [] },
    { name: 'editor', permissionIds: [grant.id] },
  ]).toContainEqual({ name: current.name, permissionIds: current.permissionIds });
});

test('concurrent initialization creates one new effective super and pending super does not count', async () => {
  const fixture = await createFixture();
  await invite(fixture, {
    email: 'pending-super@example.test',
    roleId: fixture.admin.roleId,
    activate: false,
  });
  await fixture.database.query("UPDATE admins SET status='disabled' WHERE id=$1", [
    fixture.admin.id,
  ]);
  const results = await competingWriters(fixture, () =>
    Promise.allSettled([
      fixture.access.initializeAdmin({ email: 'initialize-a@example.test', password }),
      fixture.access.initializeAdmin({ email: 'initialize-b@example.test', password }),
    ]),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({
    reason: { code: 'protected_resource' },
  });
  const count = await fixture.database.query<{ count: string }>(
    "SELECT count(*) FROM admins a JOIN credentials c ON c.admin_id=a.id JOIN roles r ON r.id=a.role_id WHERE a.status='active' AND r.is_super AND r.status='active'",
  );
  expect(Number(count.rows[0]?.count)).toBe(1);
});

test('replacing two disjoint 2000 permission sets preserves complete audit differences within budget', async () => {
  const fixture = await createFixture();
  const ids = Array.from({ length: 4000 }, () => randomUUID());
  await fixture.database.query(
    "INSERT INTO permissions(id,code,name,scope_kind) SELECT id,'bulk:p_'||ordinal,'Permission '||ordinal,'global' FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id,ordinal)",
    [ids],
  );
  const first = ids.slice(0, 2000);
  const second = ids.slice(2000);
  const editor = await role(fixture, { code: 'large_editor', permissionIds: first });
  const replaced = await fixture.access.api.replaceRolePermissions(fixture.owner, {
    id: editor.id,
    version: 1,
    permissionIds: second,
  });
  expect(new Set(replaced.permissionIds)).toEqual(new Set(second));
  expect(replaced.version).toBe(2);
  const logs = await fixture.access.api.listAuditLogs(fixture.owner, {
    operationId: 'roles.replacePermissions',
    targetId: editor.id,
  });
  expect(logs.total).toBe(1);
  const detail = z
    .object({
      added: z.array(z.string()),
      removed: z.array(z.string()),
      addedCount: z.number(),
      removedCount: z.number(),
    })
    .parse(logs.rows[0]?.detail);
  expect(new Set(detail.added)).toEqual(new Set(second));
  expect(new Set(detail.removed)).toEqual(new Set(first));
  expect(detail.addedCount).toBe(2000);
  expect(detail.removedCount).toBe(2000);
  expect(Buffer.byteLength(JSON.stringify(detail))).toBeLessThan(262144);
});

test('audit insert failure rolls back resource creation and idempotency completion together', async () => {
  const fixture = await createFixture();
  await fixture.database.query(
    "CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected audit storage failure' USING ERRCODE='58030'; END; $$; CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_test_audit()",
  );
  const ctx = context(fixture.owner.token);
  await expect(
    fixture.access.api.createPermission(ctx, {
      code: 'rollback:read',
      name: 'Rollback',
      scopeKind: 'global',
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  const resources = await fixture.database.query<{ count: string }>(
    "SELECT count(*) FROM permissions WHERE code='rollback:read'",
  );
  const idempotency = await fixture.database.query<{ count: string }>(
    'SELECT count(*) FROM idempotency_records WHERE key=$1',
    [ctx.idempotencyKey],
  );
  expect(Number(resources.rows[0]?.count)).toBe(0);
  expect(Number(idempotency.rows[0]?.count)).toBe(0);
});
