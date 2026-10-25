import { randomInt, randomUUID } from 'node:crypto';
import { afterEach, vi } from 'vitest';
import { createIdentity } from '@new-cms/cms/identity/composition';
import type { MailMessage, PasswordHasher } from '@new-cms/cms/identity/composition';
import { identityOperations } from '@new-cms/cms/identity';
import type {
  CmsPolicy,
  OperationDefinition,
  RequestContext,
} from '@new-cms/cms/platform/contracts';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createAccess } from '../composition.ts';
import { accessOperations } from '../operations.ts';

export const password = 'A long isolated password';
const fixtures: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

export function context(token?: string, idempotencyKey = randomUUID()): RequestContext {
  return { requestId: randomUUID(), ip: '127.0.0.1', idempotencyKey, ...(token ? { token } : {}) };
}

export async function createFixture(
  options: { policy?: Partial<CmsPolicy>; operations?: OperationDefinition[] } = {},
) {
  const kit = await createTestDatabase();
  const policy = createTestPolicy({
    securityLockKey: randomInt(1, 2_000_000_000),
    ...options.policy,
  });
  const messages: MailMessage[] = [];
  const passwords: PasswordHasher = {
    hash: (value) => Promise.resolve(`isolated:${value}`),
    verify: (value, hash) => Promise.resolve(hash === `isolated:${value}`),
    close: () => Promise.resolve(),
  };
  const identity = createIdentity({
    database: kit.database,
    policy,
    passwords,
    mailer: {
      send(message) {
        messages.push(message);
        return Promise.resolve('accepted');
      },
      close: () => Promise.resolve(),
    },
  });
  const accessOptions = {
    database: kit.database,
    policy,
    identity: identity.participants,
    operations: [...accessOperations, ...identityOperations, ...(options.operations ?? [])],
    collectionKeys: ['articles', 'pages'],
    navigationPaths: ['/dashboard', '/articles', '/pages'],
    navigationIcons: ['home', 'folder'],
  };
  const access = createAccess(accessOptions);
  fixtures.push({
    close: async () => {
      await identity.close();
      await kit.close();
    },
  });
  await access.reconcile();
  const admin = await access.initializeAdmin({ email: 'owner@example.test', password });
  const login = await identity.api.login(context(), { email: admin.email, password });
  const owner = context(login.token);
  return { ...kit, access, identity, policy, owner, admin, messages, accessOptions };
}

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

export async function invite(
  fixture: Fixture,
  input: { email: string; roleId: string; activate?: boolean },
) {
  const created = await fixture.access.api.createAdmin(context(fixture.owner.token), {
    email: input.email,
    roleId: input.roleId,
  });
  if (input.activate === false) return { admin: created.admin, ctx: context() };
  await vi.waitFor(() => {
    if (!fixture.messages.some((message) => message.to === input.email))
      throw new Error('Invitation not dispatched');
  });
  const message = fixture.messages.findLast((item) => item.to === input.email);
  if (!message) throw new Error('Invitation missing');
  await fixture.identity.api.acceptInvitation(context(), {
    token: message.token,
    newPassword: password,
  });
  const login = await fixture.identity.api.login(context(), { email: input.email, password });
  const admin = await fixture.access.api.getAdmin(fixture.owner, { id: created.admin.id });
  return { admin, ctx: context(login.token) };
}

export async function role(fixture: Fixture, input: { code: string; permissionIds?: string[] }) {
  return fixture.access.api.createRole(context(fixture.owner.token), {
    name: input.code,
    ...input,
  });
}

export async function permission(
  fixture: Fixture,
  input: { code: string; scopeKind?: 'global' | 'collection'; collectionKey?: string },
) {
  return fixture.access.api.createPermission(context(fixture.owner.token), {
    name: input.code,
    scopeKind: 'global',
    ...input,
  });
}

export async function initialPermission(fixture: Fixture, code: string) {
  const result = await fixture.access.api.listPermissions(fixture.owner, { q: code });
  const value = result.rows.find((item) => item.code === code);
  if (!value) throw new Error('Initial permission missing');
  return value;
}
