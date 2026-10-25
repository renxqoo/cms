import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { appendAudit, readAudit } from '../composition.ts';

const fixtures: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
async function fixture() {
  const result = await createTestDatabase();
  fixtures.push(result);
  return result.database;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((item) => item.close()));
});
const policy = createTestPolicy();
const event = {
  actorKind: 'system',
  operationId: 'roles.replacePermissions',
  targetType: 'role',
  requestId: 'test-request',
} as const;

describe('transactional append-only audit', () => {
  it('searches literal wildcard characters without broadening audit visibility', async () => {
    const db = await fixture();
    await appendAudit(db, { ...event, targetId: '100%_done' }, policy);
    await appendAudit(db, { ...event, targetId: '100extraZdone' }, policy);
    const result = await readAudit(db, { page: 1, pageSize: 20, q: '%_' }, policy);
    expect(result.total).toBe(1);
    expect(result.rows.map((row) => row.targetId)).toEqual(['100%_done']);
    await expect(
      readAudit(db, { page: 1, pageSize: 20, q: 'x'.repeat(129) }, policy),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('persists the complete maximum grant difference and exposes only the explicit projection', async () => {
    const db = await fixture();
    const detail = {
      added: Array.from({ length: 2000 }, () => randomUUID()),
      removed: Array.from({ length: 2000 }, () => randomUUID()),
    };
    await db.transaction((tx) => appendAudit(tx, { ...event, detail }, policy));
    const result = await readAudit(db, { page: 1, pageSize: 20 }, policy);
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      actorKind: 'system',
      actorId: null,
      operationId: 'roles.replacePermissions',
      detail,
    });
    expect(result.rows[0]?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await expect(db.query("UPDATE audit_events SET request_id='rewritten'")).rejects.toMatchObject({
      code: '42501',
    });
    await expect(db.query('DELETE FROM audit_events')).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects secrets and oversized detail while rolling back the outer business write', async () => {
    const db = await fixture();
    for (const detail of [
      { nested: { password: 'never store' } },
      { link: 'https://cms.invalid/#token=secret' },
      { x: Number.NaN },
    ]) {
      await expect(appendAudit(db, { ...event, detail }, policy)).rejects.toMatchObject({
        code: 'invalid_input',
      });
    }
    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO roles(id,code,name) VALUES($1,'editor','Editor')", [
          randomUUID(),
        ]);
        await appendAudit(
          tx,
          { ...event, detail: { tooLong: 'long data' } },
          { ...policy, maxAuditBytes: 2 },
        );
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect((await db.query("SELECT id FROM roles WHERE code='editor'")).rowCount).toBe(0);
    expect((await db.query('SELECT id FROM audit_events')).rowCount).toBe(0);
  });

  it('uses matching filters for rows and totals and rejects invalid page budgets', async () => {
    const db = await fixture();
    await appendAudit(db, { ...event, targetId: 'one' }, policy);
    await appendAudit(
      db,
      { ...event, operationId: 'roles.create', targetId: 'two', detail: ['safe', true, null, 4] },
      policy,
    );
    const result = await readAudit(
      db,
      {
        page: 2,
        pageSize: 1,
        operationId: event.operationId,
        from: '2000-01-01T00:00:00Z',
        to: '2100-01-01T00:00:00Z',
        order: 'asc',
      },
      policy,
    );
    expect(result).toEqual({ rows: [], total: 1, page: 2, pageSize: 1 });
    await expect(readAudit(db, { page: 0, pageSize: 20 }, policy)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(readAudit(db, { page: 1, pageSize: 101 }, policy)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      readAudit(db, { page: Number.MAX_SAFE_INTEGER, pageSize: 20 }, policy),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
