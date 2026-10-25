import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createIdentity } from '../composition.ts';
import type { Mailer, MailMessage, PasswordHasher } from '../composition.ts';

export const password = 'valid password for CMS';
export const nextPassword = 'another strong CMS password';

export function request(token?: string): RequestContext {
  return { requestId: randomUUID(), ip: '127.0.0.1', ...(token ? { token } : {}) };
}

export function testPasswords(): PasswordHasher {
  return {
    hash: (value) => Promise.resolve(`test:${value}`),
    verify: (value, hash) => Promise.resolve(hash === `test:${value}`),
    close: () => Promise.resolve(),
  };
}

export async function fixture(
  options: { policy?: Partial<CmsPolicy>; mailer?: Mailer; passwords?: PasswordHasher } = {},
) {
  const world = await createTestDatabase();
  const policy = createTestPolicy({
    loginIpLimit: 1000,
    loginEmailIpLimit: 1000,
    resetIpLimit: 1000,
    resetCooldownMs: 0,
    invitationCooldownMs: 0,
    invitationActorLimit: 1000,
    ...options.policy,
  });
  const messages: MailMessage[] = [];
  const mailer = options.mailer ?? {
    send: (message: MailMessage) => {
      messages.push(message);
      return Promise.resolve('accepted' as const);
    },
    close: () => Promise.resolve(),
  };
  const identity = createIdentity({
    database: world.database,
    policy,
    mailer,
    passwords: options.passwords ?? testPasswords(),
  });
  const roles = await world.database.query<{ id: string }>('SELECT id FROM roles WHERE is_super');
  const [role] = roles.rows;
  if (!role) throw new Error('Missing seeded role');
  const roleId = role.id;
  const admin = await world.database.transaction((tx) =>
    identity.participants.initializeAccount(tx, {
      email: 'owner@example.com',
      displayName: 'Owner',
      roleId,
      passwordHash: `test:${password}`,
    }),
  );
  const session = await identity.api.login(request(), { email: admin.email, password });
  const context = request(session.token);
  async function invite(email = 'editor@example.com') {
    const result = await world.database.transaction(async (tx) => {
      const account = await identity.participants.createAccount(tx, {
        email,
        displayName: null,
        roleId,
      });
      const issue = await identity.participants.issueInvitation(tx, account.id, context);
      return { account, issue };
    });
    result.issue.dispatch();
    await vi.waitFor(() => {
      if (!messages.some((message) => message.to === email)) throw new Error('Mail not received');
    });
    return { ...result, token: messages.find((message) => message.to === email)?.token ?? '' };
  }
  return {
    ...world,
    identity,
    policy,
    messages,
    admin,
    context,
    session,
    invite,
    close: async () => {
      await identity.close();
      await world.close();
    },
  };
}

export type IdentityFixture = Awaited<ReturnType<typeof fixture>>;
