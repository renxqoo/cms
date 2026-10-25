import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, nextPassword, password, request } from './support.ts';
import type { IdentityFixture } from './support.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';

const worlds: IdentityFixture[] = [];
afterEach(async () => {
  for (const current of worlds.splice(0)) await current.close();
});
async function world(options: Parameters<typeof fixture>[0] = {}) {
  const result = await fixture(options);
  worlds.push(result);
  return result;
}

describe('identity public behavior', () => {
  it('regression: changing request context cannot apply one account password verification to another account', async () => {
    const state: { replacement?: { context: RequestContext; token: string } } = {};
    const passwords = {
      hash: (value: string) => {
        if (state.replacement) state.replacement.context.token = state.replacement.token;
        return Promise.resolve(`test:${value}`);
      },
      verify: (value: string, hash: string | null) => Promise.resolve(hash === `test:${value}`),
      close: () => Promise.resolve(),
    };
    const w = await world({ passwords });
    const secondaryPassword = 'secondary correct password';
    const second = await w.database.transaction((tx) =>
      w.identity.participants.initializeAccount(tx, {
        email: 'second@example.com',
        displayName: null,
        roleId: w.admin.roleId,
        passwordHash: `test:${secondaryPassword}`,
      }),
    );
    const secondSession = await w.identity.api.login(request(), {
      email: second.email,
      password: secondaryPassword,
    });
    const context = { ...w.context };
    state.replacement = { context, token: secondSession.token };
    await expect(
      w.identity.api.changePassword(context, {
        currentPassword: password,
        newPassword: nextPassword,
      }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(
      w.identity.api.login(request(), { email: second.email, password: secondaryPassword }),
    ).resolves.toHaveProperty('token');
  });

  it('normalizes email, exposes safe accounts, and keeps raw session tokens out of persistence', async () => {
    const w = await world();
    const session = await w.identity.api.login(request(), {
      email: '  OWNER@EXAMPLE.COM ',
      password,
    });
    expect(session.tokenType).toBe('Bearer');
    expect(session.token).toHaveLength(43);
    const account = await w.identity.participants.authenticate(w.database, request(session.token));
    expect(account).toMatchObject({
      email: 'owner@example.com',
      activation: 'activated',
      version: 1,
    });
    expect(account).not.toHaveProperty('passwordHash');
    const stored = await w.database.query<{ token_hash: Buffer }>(
      'SELECT token_hash FROM sessions',
    );
    expect(stored.rows.every((row) => row.token_hash.length === 32)).toBe(true);
    expect(JSON.stringify(stored.rows)).not.toContain(session.token);
    await expect(
      w.identity.api.login(request(), { email: 'owner@example.com', password, roleId: 'fake' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('returns the same credential failure for unknown, wrong, inactive and unactivated accounts', async () => {
    const w = await world();
    await expect(
      w.identity.api.login(request(), { email: 'unknown@example.com', password }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(
      w.identity.api.login(request(), { email: w.admin.email, password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    const pending = await w.invite();
    await expect(
      w.identity.api.login(request(), { email: pending.account.email, password }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await w.database.transaction((tx) =>
      w.identity.participants.updateAccount(tx, { id: w.admin.id, version: 1, status: 'disabled' }),
    );
    await expect(
      w.identity.api.login(request(), { email: w.admin.email, password }),
    ).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(w.identity.participants.authenticate(w.database, w.context)).rejects.toMatchObject(
      { code: 'unauthenticated' },
    );
  });

  it('activates an invitation exactly once and rejects cross-purpose reset', async () => {
    const w = await world();
    const invitation = await w.invite();
    await expect(
      w.identity.api.resetPassword(request(), {
        token: invitation.token,
        newPassword: nextPassword,
      }),
    ).rejects.toMatchObject({ code: 'token_invalid' });
    const attempts = await Promise.allSettled([
      w.identity.api.acceptInvitation(request(), {
        token: invitation.token,
        newPassword: nextPassword,
      }),
      w.identity.api.acceptInvitation(request(), {
        token: invitation.token,
        newPassword: nextPassword,
      }),
    ]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const account = await w.identity.participants.account(w.database, invitation.account.id);
    expect(account?.activation).toBe('activated');
    await expect(
      w.identity.api.login(request(), { email: invitation.account.email, password: nextPassword }),
    ).resolves.toHaveProperty('token');
  });

  it('does not consume a valid invitation when the new password is invalid', async () => {
    const w = await world();
    const invitation = await w.invite();
    await expect(
      w.identity.api.acceptInvitation(request(), { token: invitation.token, newPassword: 'short' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      w.identity.api.acceptInvitation(request(), {
        token: invitation.token,
        newPassword: nextPassword,
      }),
    ).resolves.toBeUndefined();
    await expect(
      w.identity.participants.issueInvitation(w.database, invitation.account.id, w.context),
    ).rejects.toMatchObject({ code: 'protected_resource' });
  });

  it('revokes an earlier invitation when explicitly issued again and returns original delivery by ID', async () => {
    const w = await world();
    const initial = await w.invite();
    const again = await w.database.transaction((tx) =>
      w.identity.participants.issueInvitation(tx, initial.account.id, w.context),
    );
    again.dispatch();
    await vi.waitFor(() => expect(w.messages).toHaveLength(2));
    const [, latest] = w.messages;
    if (!latest) throw new Error('Missing second email');
    await expect(
      w.identity.api.acceptInvitation(request(), {
        token: initial.token,
        newPassword: nextPassword,
      }),
    ).rejects.toMatchObject({ code: 'token_invalid' });
    await expect(
      w.identity.api.acceptInvitation(request(), {
        token: latest.token,
        newPassword: nextPassword,
      }),
    ).resolves.toBeUndefined();
    const originalDelivery = await w.identity.participants.delivery(
      w.database,
      initial.issue.delivery.id,
    );
    expect(originalDelivery?.id).toBe(initial.issue.delivery.id);
    expect(originalDelivery?.id).not.toBe(again.delivery.id);
  });

  it('keeps logout idempotent for a known token while refusing unknown tokens', async () => {
    const w = await world();
    await w.identity.api.logout(w.context);
    await w.identity.api.logout(w.context);
    const audit = await w.database.query<{ total: string }>(
      "SELECT count(*) AS total FROM audit_events WHERE operation_id='identity.logout'",
    );
    expect(Number(audit.rows[0]?.total)).toBe(1);
    await expect(w.identity.participants.authenticate(w.database, w.context)).rejects.toMatchObject(
      { code: 'unauthenticated' },
    );
    await expect(w.identity.api.logout(request('a'.repeat(43)))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(w.identity.api.logout(request('bad'))).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('limits live sessions and expires at the database-time boundary', async () => {
    const w = await world({ policy: { maxSessions: 2 } });
    const second = await w.identity.api.login(request(), { email: w.admin.email, password });
    const third = await w.identity.api.login(request(), { email: w.admin.email, password });
    await expect(w.identity.participants.authenticate(w.database, w.context)).rejects.toMatchObject(
      { code: 'unauthenticated' },
    );
    await expect(
      w.identity.participants.authenticate(w.database, request(second.token)),
    ).resolves.toHaveProperty('id', w.admin.id);
    await w.database.query(
      "UPDATE sessions SET created_at=now()-interval '1 second',expires_at=now()",
    );
    await expect(
      w.identity.participants.authenticate(w.database, request(third.token)),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('returns uniform reset acceptance and prevents reset from activating a pending account', async () => {
    const w = await world();
    const pending = await w.invite();
    await expect(
      w.identity.api.requestPasswordReset(request(), { email: 'unknown@example.com' }),
    ).resolves.toEqual({ accepted: true });
    await expect(
      w.identity.api.requestPasswordReset(request(), { email: pending.account.email }),
    ).resolves.toEqual({ accepted: true });
    expect(w.messages).toHaveLength(1);
    await w.identity.api.requestPasswordReset(request(), { email: w.admin.email });
    await vi.waitFor(() => expect(w.messages).toHaveLength(2));
    const [, message] = w.messages;
    if (!message) throw new Error('Missing reset message');
    await expect(
      w.identity.api.acceptInvitation(request(), {
        token: message.token,
        newPassword: nextPassword,
      }),
    ).rejects.toMatchObject({ code: 'token_invalid' });
    await w.identity.api.resetPassword(request(), {
      token: message.token,
      newPassword: nextPassword,
    });
    await expect(w.identity.participants.authenticate(w.database, w.context)).rejects.toMatchObject(
      { code: 'unauthenticated' },
    );
    await expect(
      w.identity.api.login(request(), { email: w.admin.email, password: nextPassword }),
    ).resolves.toHaveProperty('token');
  });

  it('regression: changing password invalidates a previously issued reset link', async () => {
    const w = await world();
    await w.identity.api.requestPasswordReset(request(), { email: w.admin.email });
    await vi.waitFor(() => expect(w.messages).toHaveLength(1));
    const [reset] = w.messages;
    if (!reset) throw new Error('Missing reset email');
    await w.identity.api.changePassword(w.context, {
      currentPassword: password,
      newPassword: nextPassword,
    });
    await expect(
      w.identity.api.resetPassword(request(), {
        token: reset.token,
        newPassword: 'stolen reset password',
      }),
    ).rejects.toMatchObject({ code: 'token_invalid' });
    await expect(
      w.identity.api.login(request(), { email: w.admin.email, password: nextPassword }),
    ).resolves.toHaveProperty('token');
  });

  it('rolls back token consumption, password and revocation when success audit cannot append', async () => {
    const w = await world();
    const invitation = await w.invite();
    await w.database.query(
      "CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$",
    );
    await w.database.query(
      'CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit()',
    );
    await expect(
      w.identity.api.acceptInvitation(request(), {
        token: invitation.token,
        newPassword: nextPassword,
      }),
    ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    expect(
      (await w.identity.participants.account(w.database, invitation.account.id))?.activation,
    ).toBe('pending');
    await w.database.query('DROP TRIGGER reject_audit ON audit_events');
    await expect(
      w.identity.api.acceptInvitation(request(), {
        token: invitation.token,
        newPassword: nextPassword,
      }),
    ).resolves.toBeUndefined();
  });

  it('enforces shared login admission and reset cooldown without revealing existence', async () => {
    const w = await world({ policy: { loginEmailIpLimit: 1, resetCooldownMs: 60_000 } });
    await expect(
      w.identity.api.login(request(), { email: w.admin.email, password }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    await w.identity.api.requestPasswordReset(request(), { email: w.admin.email });
    await w.identity.api.requestPasswordReset(request(), { email: w.admin.email });
    await vi.waitFor(() => expect(w.messages).toHaveLength(1));
    expect(w.messages).toHaveLength(1);
  });
});
