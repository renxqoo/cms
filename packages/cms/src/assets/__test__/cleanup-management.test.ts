import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { createAssets } from '../composition.ts';
import type { Fixture } from './support.ts';
import { context, createFixture, pdf, readyUpload, memoryStorage } from './support.ts';
import {
  cleanupEntrySchema,
  cleanupPageSchema,
  cleanupRetryReceiptSchema,
} from '../management/contracts.ts';

async function orphan(
  kit: Fixture,
  input: { blocked?: boolean; retained?: boolean; writing?: boolean; leased?: boolean } = {},
) {
  const id = randomUUID(),
    key = `objects/${id}`;
  await kit.options.storage.put({
    key,
    bytes: pdf,
    mimeType: 'application/pdf',
    signal: AbortSignal.timeout(1000),
  });
  await kit.database.query(
    `INSERT INTO asset_objects(id,object_key,state,retain_until,write_deadline,next_cleanup_at,cleanup_blocked,cleanup_attempts,cleanup_failure_code)
    VALUES($1,$2,'pending',clock_timestamp()+$3*interval '1 hour',clock_timestamp()+$4*interval '1 hour',CASE WHEN $5 THEN clock_timestamp()+interval '1 hour' ELSE NULL END,$6,$7,$8)`,
    [
      id,
      key,
      input.retained ? 1 : -1,
      input.writing ? 1 : -1,
      input.leased ?? false,
      input.blocked ?? true,
      input.blocked === false ? 0 : 1,
      input.blocked === false ? null : 'temporarily_unavailable',
    ],
  );
  return id;
}
async function actor(kit: Fixture, superAdmin = false) {
  const role = superAdmin
    ? { id: kit.admin.roleId }
    : await kit.access.api.createRole(context(kit.owner.token), {
        code: 'cleanup_reader',
        name: 'Cleanup reader',
        permissionIds: [],
      });
  const email = superAdmin ? 'second-super@example.test' : 'cleanup-reader@example.test';
  const admin = await kit.access.api.createAdmin(context(kit.owner.token), {
    email,
    roleId: role.id,
  });
  await vi.waitFor(() => expect(kit.messages.some((item) => item.to === email)).toBe(true));
  const message = kit.messages.find((item) => item.to === email);
  if (!message) throw new Error('Missing invitation');
  await kit.identity.api.acceptInvitation(context(), {
    token: message.token,
    newPassword: 'An isolated cleanup password 2026',
  });
  const login = await kit.identity.api.login(context(), {
    email,
    password: 'An isolated cleanup password 2026',
  });
  return { ...admin.admin, ctx: () => context(login.token) };
}

it('only super administrators can enumerate safe cleanup ledger fields with stable pagination and empty-page totals', async () => {
  const kit = await createFixture();
  const ids = [];
  for (let index = 0; index < 3; index++) ids.push(await orphan(kit));
  for (const [index, id] of ids.entries())
    await kit.database.query('UPDATE asset_objects SET created_at=$2 WHERE id=$1', [
      id,
      `2026-01-0${index + 1}T00:00:00Z`,
    ]);
  const normal = await actor(kit);
  await expect(kit.assets.api.listCleanup(normal.ctx(), {})).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(kit.assets.api.getCleanup(normal.ctx(), { id: ids[0] })).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(kit.assets.api.retryCleanup(normal.ctx(), { id: ids[0] })).rejects.toMatchObject({
    code: 'forbidden',
  });
  const first = cleanupPageSchema.parse(
    await kit.assets.api.listCleanup(context(kit.owner.token), { pageSize: 2 }),
  );
  const next = cleanupPageSchema.parse(
    await kit.assets.api.listCleanup(context(kit.owner.token), { page: 2, pageSize: 2 }),
  );
  const empty = await kit.assets.api.listCleanup(context(kit.owner.token), {
    page: 3,
    pageSize: 2,
  });
  expect(first.total).toBe(3);
  expect(first.rows.map((row) => row.id)).toEqual([ids[2], ids[1]]);
  expect(next.rows.map((row) => row.id)).toEqual([ids[0]]);
  expect(new Set([...first.rows, ...next.rows].map((row) => row.id))).toEqual(new Set(ids));
  expect(empty).toEqual({ rows: [], total: 3, page: 3, pageSize: 2 });
  const detail = cleanupEntrySchema.parse(
    await kit.assets.api.getCleanup(context(kit.owner.token), { id: ids[0] }),
  );
  expect(detail).toMatchObject({
    id: ids[0],
    blocked: true,
    attempts: 1,
    failureCode: 'temporarily_unavailable',
  });
  expect(JSON.stringify(first)).not.toContain('objects/');
  await expect(kit.assets.api.listCleanup(context(), {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  expect(
    await kit.assets.api.listCleanup(context(kit.owner.token), {
      blocked: false,
      state: 'deleted',
    }),
  ).toMatchObject({ rows: [], total: 0 });
  await expect(
    kit.assets.api.listCleanup(context(kit.owner.token), {
      pageSize: kit.options.policy.maxPageSize + 1,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.assets.api.listCleanup(context(kit.owner.token), {
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.assets.api.getCleanup(context(kit.owner.token), { id: randomUUID() }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('accepts a durable idempotent retry without deleting bytes in the request and lets maintenance finish it', async () => {
  const kit = await createFixture();
  const id = await orphan(kit);
  const request = context(kit.owner.token);
  const receipt = cleanupRetryReceiptSchema.parse(
    await kit.assets.api.retryCleanup(request, { id }),
  );
  expect(receipt).toEqual({ id, accepted: true, location: `/v1/asset-cleanups/${id}` });
  expect(kit.memory.objects.size).toBe(1);
  expect(
    await kit.assets.api.listCleanup(context(kit.owner.token), {
      blocked: false,
      state: 'pending',
    }),
  ).toMatchObject({ total: 1, rows: [{ id }] });
  expect(await kit.assets.api.retryCleanup(request, { id })).toEqual(receipt);
  const before = await kit.database.query<{ generation: string; blocked: boolean }>(
    `SELECT cleanup_generation::text AS generation,cleanup_blocked AS blocked FROM asset_objects WHERE id=$1`,
    [id],
  );
  expect(before.rows).toEqual([{ generation: '1', blocked: false }]);
  await expect(kit.assets.api.retryCleanup(context(kit.owner.token), { id })).rejects.toMatchObject(
    { code: 'version_conflict' },
  );
  const missingKey = context(kit.owner.token);
  delete missingKey.idempotencyKey;
  await expect(kit.assets.api.retryCleanup(missingKey, { id })).rejects.toMatchObject({
    code: 'invalid_input',
  });
  await expect(kit.assets.api.retryCleanup(request, { id: randomUUID() })).rejects.toMatchObject({
    code: 'idempotency_conflict',
  });
  expect(
    (
      await kit.database.query(
        "SELECT id FROM audit_events WHERE operation_id='assets.retryCleanup'",
      )
    ).rowCount,
  ).toBe(1);
  await kit.assets.maintenance();
  expect(kit.memory.objects.size).toBe(0);
  expect(await kit.assets.api.getCleanup(context(kit.owner.token), { id })).toMatchObject({
    state: 'deleted',
    blocked: false,
    attempts: 0,
  });
});

it('keeps references, retention, write deadlines and active cleanup leases protected after retry acceptance', async () => {
  const kit = await createFixture();
  const ready = await readyUpload(kit);
  await kit.database.query('UPDATE asset_objects SET cleanup_blocked=true,cleanup_attempts=1');
  const linked = await kit.database.query<{ id: string }>('SELECT id FROM asset_objects');
  const ids = [
    linked.rows[0]?.id,
    await orphan(kit, { retained: true }),
    await orphan(kit, { writing: true }),
    await orphan(kit, { leased: true }),
  ];
  for (const id of ids) {
    if (!id) throw new Error('Missing protected object');
    await kit.assets.api.retryCleanup(context(kit.owner.token), { id });
  }
  await kit.assets.maintenance();
  expect(kit.memory.objects.size).toBe(4);
  expect(
    (
      await kit.assets.api.readUpload(context(kit.owner.token), {
        collection: 'media',
        uploadId: ready.id,
      })
    ).status,
  ).toBe('ready');
  expect(
    (await kit.database.query("SELECT id FROM asset_objects WHERE state='deleted'")).rowCount,
  ).toBe(0);
  const leased = await kit.assets.api.getCleanup(context(kit.owner.token), { id: ids[3] });
  expect(Date.parse(leased.nextCleanupAt ?? '')).toBeGreaterThan(Date.now());
});

it('rolls back retry generation and the idempotency receipt when audit insertion fails', async () => {
  const kit = await createFixture();
  const id = await orphan(kit);
  await kit.database
    .query(`CREATE FUNCTION reject_cleanup_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_id='assets.retryCleanup' THEN RAISE EXCEPTION 'fixture audit rejection'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_cleanup_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_cleanup_audit()`);
  await expect(kit.assets.api.retryCleanup(context(kit.owner.token), { id })).rejects.toMatchObject(
    { code: 'temporarily_unavailable' },
  );
  const row = await kit.database.query<{ generation: string; blocked: boolean }>(
    `SELECT cleanup_generation::text AS generation,cleanup_blocked AS blocked FROM asset_objects WHERE id=$1`,
    [id],
  );
  expect(row.rows).toEqual([{ generation: '0', blocked: true }]);
  expect(
    (
      await kit.database.query(
        "SELECT id FROM idempotency_records WHERE operation_id='assets.retryCleanup'",
      )
    ).rowCount,
  ).toBe(0);
});

it('rechecks current administrator activation on an accepted retry replay', async () => {
  const kit = await createFixture();
  const id = await orphan(kit);
  const second = await actor(kit, true);
  const request = second.ctx();
  await kit.assets.api.retryCleanup(request, { id });
  await kit.access.api.updateAdmin(context(kit.owner.token), {
    id: second.id,
    version: (await kit.access.api.getAdmin(context(kit.owner.token), { id: second.id })).version,
    status: 'disabled',
  });
  await expect(kit.assets.api.retryCleanup(request, { id })).rejects.toMatchObject({
    code: 'unauthenticated',
  });
});

it.each(['failure', 'success'] as const)(
  'a stale cleanup %s cannot overwrite an explicitly retried newer generation',
  async (outcome) => {
    const memory = memoryStorage();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    const remove = memory.driver.remove.bind(memory.driver);
    memory.driver.remove = async (input) => {
      calls += 1;
      if (calls === 1) {
        entered.resolve();
        await release.promise;
        if (outcome === 'failure') throw new CmsError('temporarily_unavailable');
        return remove(input);
      }
      throw new CmsError('invalid_input');
    };
    const kit = await createFixture({ storage: memory.driver, limits: { jobAttempts: 1 } });
    const id = await orphan(kit, { blocked: false });
    const first = kit.assets.maintenance();
    const second = createAssets(kit.options);
    try {
      await entered.promise;
      await kit.database.query(
        "UPDATE asset_objects SET next_cleanup_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [id],
      );
      await second.maintenance();
      expect(await kit.assets.api.getCleanup(context(kit.owner.token), { id })).toMatchObject({
        blocked: true,
        attempts: 1,
        failureCode: 'invalid_input',
      });
      await kit.assets.api.retryCleanup(context(kit.owner.token), { id });
      release.resolve();
      await first;
      expect(await kit.assets.api.getCleanup(context(kit.owner.token), { id })).toMatchObject({
        state: 'deleting',
        blocked: false,
        attempts: 0,
        failureCode: null,
      });
    } finally {
      release.resolve();
      await first;
      await second.close();
    }
  },
);

it('serializes concurrent retries without duplicating audit or resetting an accepted generation', async () => {
  const kit = await createFixture();
  const id = await orphan(kit);
  const request = context(kit.owner.token);
  const receipts = await Promise.all([
    kit.assets.api.retryCleanup(request, { id }),
    kit.assets.api.retryCleanup(request, { id }),
  ]);
  expect(receipts[0]).toEqual(receipts[1]);
  expect(
    (
      await kit.database.query(
        "SELECT id FROM audit_events WHERE operation_id='assets.retryCleanup'",
      )
    ).rowCount,
  ).toBe(1);
  const other = await orphan(kit);
  const competing = await Promise.allSettled([
    kit.assets.api.retryCleanup(context(kit.owner.token), { id: other }),
    kit.assets.api.retryCleanup(context(kit.owner.token), { id: other }),
  ]);
  expect(competing.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  expect(competing.find((item) => item.status === 'rejected')).toMatchObject({
    reason: { code: 'version_conflict' },
  });
  await expect(
    kit.assets.api.retryCleanup(context(kit.owner.token), { id: randomUUID() }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.assets.api.retryCleanup(context(kit.owner.token), { id, force: true }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
