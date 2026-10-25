import { randomInt } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { Database } from '@new-cms/database/client';
import { fixture, nextPassword, password, request } from './support.ts';

async function holdSecurityLock(database: Database, key: number) {
  const gates: { ready?: () => void; unlock?: () => void } = {};
  const ready = new Promise<void>((resolve) => {
    gates.ready = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    gates.unlock = resolve;
  });
  const holder = database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [key]);
    gates.ready?.();
    await waiting;
  });
  await ready;
  return {
    release: async () => {
      gates.unlock?.();
      await holder;
    },
  };
}

async function waitForBlocked(database: Database, key: number) {
  await vi.waitFor(async () => {
    const result = await database.query<{ waiting: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted) AS waiting",
      [key],
    );
    expect(result.rows[0]?.waiting).toBe(true);
  });
}

async function waitForExpiry(database: Database, table: 'sessions' | 'action_tokens') {
  await vi.waitFor(
    async () => {
      const result = await database.query<{ expired: boolean }>(
        `SELECT expires_at<=clock_timestamp() AS expired FROM ${table}`,
      );
      expect(result.rows[0]?.expired).toBe(true);
    },
    { timeout: 2000, interval: 10 },
  );
}

it('regression: a session expiring while waiting for the safety lock cannot change a password', async () => {
  const w = await fixture({
    policy: { sessionTtlMs: 800, securityLockKey: randomInt(1, 2_000_000_000) },
  });
  const lock = await holdSecurityLock(w.database, w.policy.securityLockKey);
  try {
    const attempted = w.identity.api.changePassword(w.context, {
      currentPassword: password,
      newPassword: nextPassword,
    });
    const outcome = attempted.then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    );
    await waitForBlocked(w.database, w.policy.securityLockKey);
    await waitForExpiry(w.database, 'sessions');
    await lock.release();
    expect(await outcome).toMatchObject({ error: { code: 'unauthenticated' } });
    const credential = await w.database.query<{ version: number }>(
      'SELECT version FROM credentials WHERE admin_id=$1',
      [w.admin.id],
    );
    expect(credential.rows).toEqual([{ version: 1 }]);
  } finally {
    await lock.release();
    await w.close();
  }
});

it('regression: an invitation expiring while waiting for the safety lock cannot activate an account', async () => {
  const w = await fixture({
    policy: { invitationTtlMs: 800, securityLockKey: randomInt(1, 2_000_000_000) },
  });
  const invitation = await w.invite();
  const lock = await holdSecurityLock(w.database, w.policy.securityLockKey);
  try {
    const attempted = w.identity.api.acceptInvitation(request(), {
      token: invitation.token,
      newPassword: nextPassword,
    });
    const outcome = attempted.then(
      () => ({ error: null }),
      (error: unknown) => ({ error }),
    );
    await waitForBlocked(w.database, w.policy.securityLockKey);
    await waitForExpiry(w.database, 'action_tokens');
    await lock.release();
    expect(await outcome).toMatchObject({ error: { code: 'token_invalid' } });
    expect(
      (await w.identity.participants.account(w.database, invitation.account.id))?.activation,
    ).toBe('pending');
  } finally {
    await lock.release();
    await w.close();
  }
});
