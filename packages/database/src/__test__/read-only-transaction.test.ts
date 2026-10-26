import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import type { SqlExecutor } from '../client.ts';
import { createTestDatabase } from '../../../../test/support/database.ts';

const fixtures: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
async function fixture(maxConnections = 8) {
  const kit = await createTestDatabase({ maxConnections });
  fixtures.push(kit);
  return kit.database;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('keeps one consistent read view while another connection commits changes', async () => {
  const db = await fixture();
  await db.query("INSERT INTO roles(id,code,name) VALUES($1,'consistent_reader','Before')", [
    randomUUID(),
  ]);
  const rows = await db.readOnlyTransaction(async (tx) => {
    const before = await tx.query("SELECT name FROM roles WHERE code='consistent_reader'");
    await db.transaction((writer) =>
      writer.query("UPDATE roles SET name='After' WHERE code='consistent_reader'"),
    );
    const after = await tx.query("SELECT name FROM roles WHERE code='consistent_reader'");
    return [before.rows, after.rows];
  });
  expect(rows).toEqual([[{ name: 'Before' }], [{ name: 'Before' }]]);
  expect((await db.query("SELECT name FROM roles WHERE code='consistent_reader'")).rows).toEqual([
    { name: 'After' },
  ]);
});

it('rejects SQL writes in read-only transactions and restores writable pool capacity', async () => {
  const db = await fixture();
  await expect(
    db.readOnlyTransaction((tx) =>
      tx.query("INSERT INTO roles(id,code,name) VALUES($1,'reader_write','Rejected')", [
        randomUUID(),
      ]),
    ),
  ).rejects.toMatchObject({ code: '25006' });
  await db.transaction((tx) =>
    tx.query("INSERT INTO roles(id,code,name) VALUES($1,'writer_after_reader','Allowed')", [
      randomUUID(),
    ]),
  );
  expect((await db.query("SELECT code FROM roles WHERE code='writer_after_reader'")).rowCount).toBe(
    1,
  );
});

it('invalidates retained read executors after commit and rollback', async () => {
  const db = await fixture();
  const committed = await db.readOnlyTransaction((tx) => Promise.resolve(tx));
  await expect(committed.query('SELECT 1')).rejects.toThrow('Transaction is no longer active');
  const failed = new Error('Reader failed');
  let rolledBack: SqlExecutor | undefined;
  await expect(
    db.readOnlyTransaction((tx) => {
      rolledBack = tx;
      return Promise.reject(failed);
    }),
  ).rejects.toBe(failed);
  if (!rolledBack) throw new Error('Rollback executor was not captured');
  await expect(rolledBack.query('SELECT 1')).rejects.toThrow('Transaction is no longer active');
  expect((await db.readOnlyTransaction((tx) => tx.query('SELECT 1 AS ready'))).rows).toEqual([
    { ready: 1 },
  ]);
});

it('cancels active read SQL and releases its connection for the next reader', async () => {
  const db = await fixture(1);
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  const reading = db.readOnlyTransaction(async (tx) => {
    await tx.query('SELECT 1');
    started.resolve();
    await tx.query('SELECT pg_sleep(2)');
  }, controller.signal);
  await started.promise;
  controller.abort();
  await expect(reading).rejects.toThrow(/terminated|abort/i);
  expect((await db.readOnlyTransaction((tx) => tx.query('SELECT 1 AS ready'))).rows).toEqual([
    { ready: 1 },
  ]);
});

it('rejects a previously cancelled reader before invoking application work', async () => {
  const db = await fixture();
  const controller = new AbortController();
  controller.abort(new Error('Already cancelled'));
  let entered = false;
  await expect(
    db.readOnlyTransaction(() => {
      entered = true;
      return Promise.resolve();
    }, controller.signal),
  ).rejects.toThrow('Already cancelled');
  expect(entered).toBe(false);
});

it('does not report success after a reader catches an aborted PostgreSQL transaction', async () => {
  const db = await fixture();
  await expect(
    db.readOnlyTransaction(async (tx) => {
      try {
        await tx.query('SELECT * FROM missing_reader_table');
      } catch {
        return 'caught';
      }
      return 'unexpected';
    }),
  ).rejects.toThrow('Transaction did not commit');
});
