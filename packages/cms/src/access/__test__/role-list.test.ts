import type { QueryResultRow } from 'pg';
import { expect, test } from 'vitest';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import { createAccess } from '../composition.ts';
import { context, createFixture, invite, permission, role } from './support.ts';

function measureQueries(database: Database) {
  const measurements = { queries: 0, active: 0, peak: 0 };
  const measured: Database = {
    ...database,
    transaction<T>(work: (tx: SqlExecutor) => Promise<T>, signal?: AbortSignal) {
      return database.transaction(
        (tx) =>
          work({
            async query<R extends QueryResultRow>(text: string, values?: unknown[]) {
              measurements.queries += 1;
              measurements.active += 1;
              measurements.peak = Math.max(measurements.peak, measurements.active);
              try {
                return await tx.query<R>(text, values);
              } finally {
                measurements.active -= 1;
              }
            },
          }),
        signal,
      );
    },
  };
  return {
    database: measured,
    measurements,
    reset() {
      measurements.queries = 0;
      measurements.peak = 0;
    },
  };
}

test('role list keeps a constant database query budget as the returned role count grows', async () => {
  const fixture = await createFixture();
  for (let index = 0; index < 8; index += 1) await role(fixture, { code: `budget_${index}` });
  const meter = measureQueries(fixture.database);
  const access = createAccess({ ...fixture.accessOptions, database: meter.database });
  const first = await access.api.listRoles(fixture.owner, { q: 'budget_', pageSize: 1 });
  const smallBudget = meter.measurements.queries;
  expect(first).toMatchObject({
    total: 8,
    rows: [expect.objectContaining({ adminCount: 0, permissionCount: 0 })],
  });
  meter.reset();
  const all = await access.api.listRoles(fixture.owner, { q: 'budget_', pageSize: 8 });
  expect(all.rows).toHaveLength(8);
  expect(all.total).toBe(8);
  expect(meter.measurements.queries).toBeLessThanOrEqual(smallBudget);
  expect(meter.measurements.peak).toBe(1);
});

test('role list counts all account references and permission grants independently across filtered pages', async () => {
  const fixture = await createFixture();
  const grants = [
    await permission(fixture, { code: 'counts:first' }),
    await permission(fixture, { code: 'counts:second' }),
    await permission(fixture, { code: 'counts:third' }),
  ] as const;
  const populated = await role(fixture, {
    code: 'counts_a',
    permissionIds: grants.map((grant) => grant.id),
  });
  const accountsOnly = await role(fixture, { code: 'counts_b' });
  const grantsOnly = await role(fixture, { code: 'counts_c', permissionIds: [grants[0].id] });
  const empty = await role(fixture, { code: 'counts_d' });
  for (const [index, status] of ['active', 'disabled', 'archived'].entries()) {
    const member = await invite(fixture, {
      email: `count-${index}@example.test`,
      roleId: populated.id,
      activate: false,
    });
    if (status !== 'active')
      await fixture.access.api.updateAdmin(fixture.owner, {
        id: member.admin.id,
        version: 1,
        status,
      });
  }
  await invite(fixture, {
    email: 'account-only@example.test',
    roleId: accountsOnly.id,
    activate: false,
  });
  const query = { q: 'counts_', pageSize: 2, sortBy: 'code', order: 'asc' };
  const first = await fixture.access.api.listRoles(context(fixture.owner.token), query);
  const second = await fixture.access.api.listRoles(fixture.owner, { ...query, page: 2 });
  const projection = (rows: typeof first.rows) =>
    rows.map(({ id, adminCount, permissionCount }) => ({ id, adminCount, permissionCount }));
  expect(first.total).toBe(4);
  expect(second.total).toBe(4);
  expect(projection(first.rows)).toEqual([
    { id: populated.id, adminCount: 3, permissionCount: 3 },
    { id: accountsOnly.id, adminCount: 1, permissionCount: 0 },
  ]);
  expect(projection(second.rows)).toEqual([
    { id: grantsOnly.id, adminCount: 0, permissionCount: 1 },
    { id: empty.id, adminCount: 0, permissionCount: 0 },
  ]);
  expect(await fixture.access.api.listRoles(fixture.owner, { ...query, page: 3 })).toMatchObject({
    total: 4,
    rows: [],
  });
  expect(await fixture.access.api.listRoles(fixture.owner, { q: 'not_present' })).toMatchObject({
    total: 0,
    rows: [],
  });
});
