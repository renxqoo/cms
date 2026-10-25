import { appendAudit } from '@new-cms/cms/audit/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { credentialByEmail } from './adapters/postgres/credentials.ts';
import { issueSession, revokeSession } from './adapters/postgres/sessions.ts';
import { admitLogin } from './admission.ts';
import { assertRunning, databaseWork, secure } from './runtime.ts';
import type { IdentityDependencies } from './runtime.ts';
import { checkedToken, identityInputSchemas, loginSchema, parseInput } from './validation.ts';

export async function login(deps: IdentityDependencies, ctx: RequestContext, value: unknown) {
  const input = parseInput(loginSchema, value);
  await admitLogin(deps, ctx, input.email);
  const snapshot = await databaseWork(deps.database, (tx) => credentialByEmail(tx, input.email));
  const valid = await deps.passwords.verify(
    input.password,
    snapshot?.password_hash ?? null,
    ctx.signal,
  );
  if (!valid || snapshot?.status !== 'active' || snapshot.version === null)
    fail('invalid_credentials');
  assertRunning(ctx);
  return secure(deps, ctx, async (tx) => {
    const current = await credentialByEmail(tx, input.email);
    if (
      current?.status !== 'active' ||
      current.version !== snapshot.version ||
      current.password_hash !== snapshot.password_hash
    )
      fail('invalid_credentials');
    const session = await issueSession(tx, { adminId: current.admin_id, policy: deps.policy });
    await appendAudit(
      tx,
      {
        actorKind: 'admin',
        actorId: current.admin_id,
        operationId: 'identity.login',
        targetType: 'admin',
        targetId: current.admin_id,
        requestId: ctx.requestId,
      },
      deps.policy,
    );
    return session;
  });
}

export async function logout(
  deps: IdentityDependencies,
  ctx: RequestContext,
  value?: unknown,
): Promise<void> {
  parseInput(identityInputSchemas['identity.logout'], value === undefined ? {} : value);
  const token = checkedToken(ctx.token);
  await secure(deps, ctx, async (tx) => {
    const { adminId, changed } = await revokeSession(tx, token);
    if (!changed) return;
    await appendAudit(
      tx,
      {
        actorKind: 'admin',
        actorId: adminId,
        operationId: 'identity.logout',
        targetType: 'admin',
        targetId: adminId,
        requestId: ctx.requestId,
      },
      deps.policy,
    );
  });
}
