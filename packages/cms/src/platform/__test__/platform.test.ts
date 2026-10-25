import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { CmsError, fail } from '../contracts.ts';
import { securityTransaction } from '../security-lock.ts';
import { cleanupIdempotency, withIdempotency } from '../idempotency.ts';
import {
  cleanupRateLimits,
  consumeRateLimit,
  rateLimitKey,
  requireRateLimit,
} from '../rate-limits.ts';

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

it('cleans expired platform records in bounded batches while preserving live windows', async () => {
  const db = await fixture();
  const actorId = await actor(db);
  for (const key of ['expired-key-0001', 'expired-key-0002', 'current-key-0003']) {
    await db.transaction((tx) =>
      withIdempotency(
        tx,
        {
          actorId,
          operationId: 'roles.create',
          key,
          input: {},
          ttlMs: 1000,
        },
        () => Promise.resolve({ created: key }),
      ),
    );
    await consumeRateLimit(db, { key, limit: 5, windowMs: 60_000 });
  }
  await db.query(
    "UPDATE idempotency_records SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE key LIKE 'expired%'",
  );
  await db.query(
    "UPDATE rate_limit_buckets SET expires_at=now()-interval '1 hour' WHERE key LIKE 'expired%'",
  );
  await expect(cleanupIdempotency(db, 1)).resolves.toBe(1);
  await expect(cleanupRateLimits(db, 1)).resolves.toBe(1);
  expect((await db.query('SELECT id FROM idempotency_records')).rowCount).toBe(2);
  await expect(cleanupIdempotency(db, 100)).resolves.toBe(1);
  await expect(cleanupRateLimits(db, 100)).resolves.toBe(1);
  expect((await db.query('SELECT key FROM rate_limit_buckets')).rows).toEqual([
    { key: 'current-key-0003' },
  ]);
  await expect(cleanupIdempotency(db, 0)).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(cleanupRateLimits(db, -1)).rejects.toMatchObject({ code: 'invalid_input' });
});

async function actor(db: Awaited<ReturnType<typeof fixture>>) {
  const id = randomUUID();
  await db.query('INSERT INTO admins(id,email,role_id) SELECT $1,$2,id FROM roles WHERE is_super', [
    id,
    `${id}@example.com`,
  ]);
  return id;
}

it('lets shared writers coexist, excludes revocation, and observes committed revocation afterward', async () => {
  const db = await fixture();
  let release: (() => void) | undefined;
  let announce: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    announce = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = securityTransaction(db, policy, {
    mode: 'shared',
    work: async (tx) => {
      await tx.query("INSERT INTO roles(id,code,name) VALUES($1,'editor','Editor')", [
        randomUUID(),
      ]);
      announce?.();
      await gate;
    },
  });
  await held;
  const locks = await db.transaction(async (tx) => {
    const exclusive = await tx.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [policy.securityLockKey],
    );
    const shared = await tx.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock_shared($1::bigint) AS acquired',
      [policy.securityLockKey],
    );
    return { exclusive: exclusive.rows[0]?.acquired, shared: shared.rows[0]?.acquired };
  });
  expect(locks).toEqual({ exclusive: false, shared: true });
  release?.();
  await writer;
  await securityTransaction(db, policy, {
    mode: 'exclusive',
    work: async (tx) => {
      await tx.query("UPDATE roles SET status='disabled' WHERE code='editor'");
    },
  });
  const after = await securityTransaction(db, policy, {
    mode: 'shared',
    work: (tx) => tx.query("SELECT status FROM roles WHERE code='editor'"),
  });
  expect(after.rows[0]?.['status']).toBe('disabled');
});

it('preserves business errors and maps database infrastructure failures without leaking SQL', async () => {
  const db = await fixture();
  await expect(
    securityTransaction(db, policy, {
      mode: 'exclusive',
      work: () => Promise.reject(new CmsError('forbidden')),
    }),
  ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
  await expect(
    securityTransaction(db, policy, {
      mode: 'exclusive',
      work: (tx) => tx.query('SELECT * FROM nonexistent_secret_table'),
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable', status: 503 });
  expect(() => fail('rate_limited', { retryAfterSeconds: 12 })).toThrow('rate limited');
});

it('maps actual uniqueness and reference constraints to public conflicts', async () => {
  const db = await fixture();
  await db.query("INSERT INTO roles(id,code,name) VALUES($1,'editor','Editor')", [randomUUID()]);
  await expect(
    securityTransaction(db, policy, {
      mode: 'exclusive',
      work: (tx) =>
        tx.query("INSERT INTO roles(id,code,name) VALUES($1,'editor','duplicate')", [randomUUID()]),
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
  const adminId = await actor(db);
  await db.query('INSERT INTO credentials(admin_id,password_hash) VALUES($1,$2)', [
    adminId,
    'test-only',
  ]);
  await expect(
    securityTransaction(db, policy, {
      mode: 'exclusive',
      work: (tx) => tx.query('DELETE FROM admins WHERE id=$1', [adminId]),
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await expect(
    securityTransaction(db, policy, {
      mode: 'exclusive',
      work: (tx) => tx.query("INSERT INTO roles(id,code,name) VALUES($1,'bad','')", [randomUUID()]),
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('replays one effect for equivalent key ordering and rejects a changed request', async () => {
  const db = await fixture();
  const actorId = await actor(db);
  const input = {
    actorId,
    operationId: 'roles.create',
    key: 'idempotency-key-0001',
    input: { name: 'Editor', code: 'editor' },
    ttlMs: policy.idempotencyTtlMs,
  };
  const first = await db.transaction((tx) =>
    withIdempotency(tx, input, async () => {
      const id = randomUUID();
      await tx.query("INSERT INTO roles(id,code,name) VALUES($1,'editor','Editor')", [id]);
      return { id };
    }),
  );
  const replay = await db.transaction((tx) =>
    withIdempotency(tx, { ...input, input: { code: 'editor', name: 'Editor' } }, () =>
      Promise.reject(new Error('must not execute')),
    ),
  );
  expect(replay).toEqual(first);
  expect((await db.query("SELECT id FROM roles WHERE code='editor'")).rowCount).toBe(1);
  await expect(
    db.transaction((tx) =>
      withIdempotency(tx, { ...input, input: { code: 'different' } }, () => Promise.resolve(null)),
    ),
  ).rejects.toMatchObject({ code: 'idempotency_conflict' });
});

it('rolls back both effect and idempotency record when a child fails and allows a retry', async () => {
  const db = await fixture();
  const input = {
    actorId: await actor(db),
    operationId: 'roles.create',
    key: 'idempotency-key-0002',
    input: {},
    ttlMs: 1000,
  };
  await expect(
    db.transaction((tx) =>
      withIdempotency(tx, input, async () => {
        await tx.query("INSERT INTO roles(id,code,name) VALUES($1,'rollback','Rollback')", [
          randomUUID(),
        ]);
        throw new Error('child failure');
      }),
    ),
  ).rejects.toThrow('child failure');
  expect((await db.query('SELECT id FROM idempotency_records')).rowCount).toBe(0);
  expect((await db.query("SELECT id FROM roles WHERE code='rollback'")).rowCount).toBe(0);
  await expect(
    db.transaction((tx) => withIdempotency(tx, input, () => Promise.resolve({ created: true }))),
  ).resolves.toEqual({ created: true });
});

it('scopes collection keys independently and replaces an expired record', async () => {
  const db = await fixture();
  const base = {
    actorId: await actor(db),
    operationId: 'documents.create',
    key: 'idempotency-key-0003',
    input: [],
    ttlMs: 1000,
  };
  await db.transaction((tx) =>
    withIdempotency(
      tx,
      { ...base, scope: { scopeKind: 'collection', collectionKey: 'articles' } },
      () => Promise.resolve('article'),
    ),
  );
  await expect(
    db.transaction((tx) =>
      withIdempotency(
        tx,
        { ...base, scope: { scopeKind: 'collection', collectionKey: 'pages' } },
        () => Promise.resolve('page'),
      ),
    ),
  ).resolves.toBe('page');
  await db.query(
    "UPDATE idempotency_records SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour'",
  );
  await expect(
    db.transaction((tx) =>
      withIdempotency(
        tx,
        { ...base, scope: { scopeKind: 'collection', collectionKey: 'articles' } },
        () => Promise.resolve('new article'),
      ),
    ),
  ).resolves.toBe('new article');
  await expect(
    db.transaction((tx) =>
      withIdempotency(tx, { ...base, key: 'short' }, () => Promise.resolve(null)),
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('admits exactly the limit under parallel connections and resets expired windows', async () => {
  const db = await fixture();
  const input = { key: 'parallel', limit: 3, windowMs: 60_000 };
  const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit(db, input)));
  expect(results.filter((row) => row.allowed)).toHaveLength(3);
  expect(results.every((row) => row.retryAfterSeconds > 0)).toBe(true);
  await db.query(
    "UPDATE rate_limit_buckets SET expires_at=now()-interval '1 second' WHERE key='parallel'",
  );
  await expect(consumeRateLimit(db, input)).resolves.toMatchObject({ allowed: true });
});

it('uses opaque domain-separated keys and throws a retryable rejection', async () => {
  const db = await fixture();
  const key = rateLimitKey('test secret', ['login', 'user@example.com', '127.0.0.1']);
  expect(key).not.toContain('user@example.com');
  expect(key).not.toEqual(rateLimitKey('other secret', ['login', 'user@example.com', '127.0.0.1']));
  await requireRateLimit(db, { key, limit: 1, windowMs: 60_000 });
  await expect(requireRateLimit(db, { key, limit: 1, windowMs: 60_000 })).rejects.toMatchObject({
    code: 'rate_limited',
    retryAfterSeconds: 60,
  });
});
