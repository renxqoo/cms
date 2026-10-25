import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, password } from './support.ts';
import type { IdentityFixture } from './support.ts';
import type { Mailer } from '../composition.ts';

const worlds: IdentityFixture[] = [];
afterEach(async () => {
  for (const current of worlds.splice(0)) await current.close();
});
async function setup(options: Parameters<typeof fixture>[0] = {}) {
  const result = await fixture(options);
  worlds.push(result);
  return result;
}
async function prepare(w: IdentityFixture, email = 'pending@example.com') {
  return w.database.transaction(async (tx) => {
    const account = await w.identity.participants.createAccount(tx, {
      email,
      displayName: null,
      roleId: w.admin.roleId,
    });
    const issue = await w.identity.participants.issueInvitation(tx, account.id, w.context);
    return { account, issue };
  });
}

describe('account participation and projections', () => {
  it('uses literal search, stable pagination and activation/status filtering with true totals', async () => {
    const w = await setup();
    const first = await w.database.transaction((tx) =>
      w.identity.participants.createAccount(tx, {
        email: 'one@example.com',
        displayName: '100% literal',
        roleId: w.admin.roleId,
      }),
    );
    const second = await w.database.transaction((tx) =>
      w.identity.participants.createAccount(tx, {
        email: 'two@example.com',
        displayName: '100x ordinary',
        roleId: w.admin.roleId,
      }),
    );
    const literal = await w.identity.participants.listAccounts(w.database, {
      q: '%',
      sortBy: 'displayName',
      order: 'asc',
    });
    expect(literal.rows.map((row) => row.id)).toEqual([first.id]);
    expect(literal.total).toBe(1);
    const page = await w.identity.participants.listAccounts(w.database, {
      page: 2,
      pageSize: 1,
      activation: 'pending',
      sortBy: 'email',
      order: 'asc',
    });
    expect(page.rows.map((row) => row.id)).toEqual([second.id]);
    expect(page.total).toBe(2);
    await w.database.transaction((tx) =>
      w.identity.participants.updateAccount(tx, { id: first.id, version: 1, status: 'disabled' }),
    );
    const disabled = await w.identity.participants.listAccounts(w.database, { status: 'disabled' });
    expect(disabled.rows.map((row) => row.id)).toEqual([first.id]);
    const beyond = await w.identity.participants.listAccounts(w.database, {
      page: 50,
      pageSize: 1,
      activation: 'activated',
    });
    expect(beyond.rows).toEqual([]);
    expect(beyond.total).toBe(1);
    await expect(
      w.identity.participants.listAccounts(w.database, {
        page: Number.MAX_SAFE_INTEGER,
        pageSize: 100,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('enforces account identity/version and archival while keeping an unchanged resource stable', async () => {
    const w = await setup();
    await expect(
      w.identity.participants.createAccount(w.database, {
        email: 'OWNER@example.com',
        displayName: null,
        roleId: w.admin.roleId,
      }),
    ).rejects.toMatchObject({ code: 'identifier_taken' });
    expect(await w.identity.participants.account(w.database, randomUUID())).toBeNull();
    expect(await w.identity.participants.delivery(w.database, randomUUID())).toBeNull();
    const same = await w.identity.participants.updateAccount(w.database, {
      id: w.admin.id,
      version: 1,
      displayName: 'Owner',
    });
    expect(same.version).toBe(1);
    await expect(
      w.identity.participants.updateAccount(w.database, {
        id: w.admin.id,
        version: 9,
        displayName: 'Changed',
      }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    await expect(
      w.identity.participants.updateAccount(w.database, {
        id: randomUUID(),
        version: 1,
        displayName: 'Missing',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const changed = await w.identity.participants.updateAccount(w.database, {
      id: w.admin.id,
      version: 1,
      displayName: 'Renamed',
    });
    expect(changed).toMatchObject({ displayName: 'Renamed', version: 2 });
    const archived = await w.identity.participants.updateAccount(w.database, {
      id: w.admin.id,
      version: 2,
      status: 'archived',
    });
    await expect(
      w.identity.participants.updateAccount(w.database, {
        id: w.admin.id,
        version: archived.version,
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      w.identity.participants.issueInvitation(w.database, randomUUID(), w.context),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('enforces invitation cooldown and independent password boundaries without trimming', async () => {
    const w = await setup({ policy: { invitationCooldownMs: 60_000 } });
    const pending = await prepare(w);
    await expect(
      w.database.transaction((tx) =>
        w.identity.participants.issueInvitation(tx, pending.account.id, w.context),
      ),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    for (const size of [14, 129])
      await expect(w.identity.participants.preparePassword('x'.repeat(size))).rejects.toMatchObject(
        { code: 'invalid_input' },
      );
    await expect(w.identity.participants.preparePassword('x'.repeat(15))).resolves.toBe(
      `test:${'x'.repeat(15)}`,
    );
    await expect(w.identity.participants.preparePassword('🙂'.repeat(128))).resolves.toBe(
      `test:${'🙂'.repeat(128)}`,
    );
    await expect(w.identity.participants.preparePassword('  valid password  ')).resolves.toBe(
      'test:  valid password  ',
    );
    await expect(
      w.identity.api.changePassword(w.context, {
        currentPassword: 'wrong',
        newPassword: 'long valid password',
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(
      w.identity.api.login(w.context, { email: w.admin.email, password }),
    ).resolves.toHaveProperty('token');
  });
});

describe('one-attempt identity mail and maintenance', () => {
  it('regression: maintenance cannot overwrite a delivery accepted while it waited for the row lock', async () => {
    const w = await setup();
    const issue = await prepare(w);
    await w.database.query(
      `UPDATE email_deliveries SET status='sending',
      created_at=clock_timestamp()-interval '1 minute',started_at=clock_timestamp()
      WHERE id=$1`,
      [issue.issue.delivery.id],
    );
    const gates: { ready?: () => void; unlock?: () => void; pid?: number } = {};
    const ready = new Promise<void>((resolve) => {
      gates.ready = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      gates.unlock = resolve;
    });
    const sender = w.database.transaction(async (tx) => {
      const connections = await tx.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const [connection] = connections.rows;
      if (!connection) throw new Error('Sender connection was not acquired');
      gates.pid = connection.pid;
      await tx.query(
        `UPDATE email_deliveries SET status='accepted',
        finished_at=clock_timestamp(),failure_code=NULL WHERE id=$1`,
        [issue.issue.delivery.id],
      );
      gates.ready?.();
      await waiting;
    });
    let maintenance: Promise<void> | undefined;
    try {
      await ready;
      maintenance = w.identity.maintenance();
      await vi.waitFor(async () => {
        const blocked = await w.database.query<{ waiting: boolean }>(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))) AS waiting',
          [gates.pid],
        );
        expect(blocked.rows[0]?.waiting).toBe(true);
      });
      gates.unlock?.();
      await sender;
      await maintenance;
      expect(
        (await w.identity.participants.delivery(w.database, issue.issue.delivery.id))?.status,
      ).toBe('accepted');
    } finally {
      gates.unlock?.();
      await sender;
      await maintenance;
    }
  });

  it('cancels a blocked delivery state write at the mail deadline without sending afterward', async () => {
    const w = await setup({ policy: { mailTaskTimeoutMs: 30, deliveryStaleMs: 1 } });
    const pending = await prepare(w);
    const gates: { unlock?: () => void; ready?: () => void } = {};
    const blocked = new Promise<void>((resolve) => {
      gates.unlock = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      gates.ready = resolve;
    });
    const holding = w.database.transaction(async (tx) => {
      await tx.query('SELECT id FROM email_deliveries WHERE id=$1 FOR UPDATE', [
        pending.issue.delivery.id,
      ]);
      gates.ready?.();
      await blocked;
    });
    try {
      await ready;
      const started = Date.now();
      pending.issue.dispatch();
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
      await w.identity.close();
      expect(Date.now() - started).toBeLessThan(500);
      expect(w.messages).toHaveLength(0);
    } finally {
      gates.unlock?.();
      await holding;
    }
    await w.identity.maintenance();
    expect(
      (await w.identity.participants.delivery(w.database, pending.issue.delivery.id))?.status,
    ).toBe('unknown');
  });

  it.each(['rejected', 'unknown'] as const)(
    'persists %s without automatically sending again',
    async (outcome) => {
      let calls = 0;
      const mailer: Mailer = {
        send: () => {
          calls += 1;
          return Promise.resolve(outcome);
        },
        close: () => Promise.resolve(),
      };
      const w = await setup({ mailer });
      const pending = await prepare(w);
      pending.issue.dispatch();
      const expected = outcome === 'rejected' ? 'failed' : 'unknown';
      await vi.waitFor(async () =>
        expect(
          (await w.identity.participants.delivery(w.database, pending.issue.delivery.id))?.status,
        ).toBe(expected),
      );
      await w.identity.maintenance();
      await w.identity.maintenance();
      expect(calls).toBe(1);
      const record = await w.database.query<{ failure_code: string }>(
        'SELECT failure_code FROM email_deliveries WHERE id=$1',
        [pending.issue.delivery.id],
      );
      expect(record.rows.map((row) => row.failure_code)).toEqual([
        outcome === 'rejected' ? 'transport_rejected' : 'transport_unknown',
      ]);
    },
  );

  it('keeps an unconfirmed SMTP acceptance unknown when the terminal write fails', async () => {
    const w = await setup();
    const pending = await prepare(w);
    await w.database.query(
      "CREATE FUNCTION reject_mail_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='accepted' THEN RAISE EXCEPTION 'test final write failure'; END IF; RETURN NEW; END $$",
    );
    await w.database.query(
      'CREATE TRIGGER reject_mail_accept BEFORE UPDATE ON email_deliveries FOR EACH ROW EXECUTE FUNCTION reject_mail_accept()',
    );
    pending.issue.dispatch();
    await vi.waitFor(async () =>
      expect(
        (await w.identity.participants.delivery(w.database, pending.issue.delivery.id))?.status,
      ).toBe('unknown'),
    );
    expect(w.messages).toHaveLength(1);
    expect(
      (await w.identity.participants.account(w.database, pending.account.id))?.activation,
    ).toBe('pending');
  });

  it('does not send or reissue secrets after a pending attempt loses its process', async () => {
    const w = await setup();
    const pending = await prepare(w);
    await w.database.query(
      "UPDATE email_deliveries SET created_at=now()-interval '40 seconds' WHERE id=$1",
      [pending.issue.delivery.id],
    );
    await w.identity.maintenance();
    expect(
      (await w.identity.participants.delivery(w.database, pending.issue.delivery.id))?.status,
    ).toBe('unknown');
    expect(w.messages).toHaveLength(0);
    const tokens = await w.database.query<{ total: string }>(
      'SELECT count(*) AS total FROM action_tokens',
    );
    expect(tokens.rows.map((row) => Number(row.total))).toEqual([1]);
  });

  it('bounds active mail without queuing and cancels an active task during close', async () => {
    let calls = 0;
    const mailer: Mailer = {
      send: (message) => {
        calls += 1;
        return new Promise((resolve) => {
          message.signal.addEventListener('abort', () => resolve('unknown'), { once: true });
        });
      },
      close: () => Promise.resolve(),
    };
    const w = await setup({ mailer, policy: { mailConcurrency: 1 } });
    const first = await prepare(w);
    first.issue.dispatch();
    await vi.waitFor(() => expect(calls).toBe(1));
    const second = await prepare(w, 'second@example.com');
    second.issue.dispatch();
    await vi.waitFor(async () =>
      expect(
        (await w.identity.participants.delivery(w.database, second.issue.delivery.id))?.status,
      ).toBe('failed'),
    );
    expect(calls).toBe(1);
    await w.identity.close();
    expect(
      (await w.identity.participants.delivery(w.database, first.issue.delivery.id))?.status,
    ).toBe('unknown');
  });

  it('cleans only old invalid identity artifacts and preserves account and audit history', async () => {
    const w = await setup();
    const pending = await prepare(w);
    const before = await w.database.query<{ total: string }>(
      'SELECT count(*) AS total FROM audit_events',
    );
    await w.database.query(
      "UPDATE action_tokens SET created_at=now()-interval '20 days',expires_at=now()-interval '10 days' WHERE admin_id=$1",
      [pending.account.id],
    );
    await w.database.query(
      "UPDATE sessions SET created_at=now()-interval '20 days',expires_at=now()-interval '10 days'",
    );
    await w.identity.maintenance();
    expect(
      await w.identity.participants.delivery(w.database, pending.issue.delivery.id),
    ).toBeNull();
    const artifacts = await w.database.query<{ tokens: string; sessions: string }>(
      'SELECT (SELECT count(*) FROM action_tokens) AS tokens,(SELECT count(*) FROM sessions) AS sessions',
    );
    expect(artifacts.rows).toEqual([{ tokens: '0', sessions: '0' }]);
    expect(await w.identity.participants.account(w.database, pending.account.id)).not.toBeNull();
    const after = await w.database.query<{ total: string }>(
      'SELECT count(*) AS total FROM audit_events',
    );
    expect(after.rows).toEqual(before.rows);
  });
});
