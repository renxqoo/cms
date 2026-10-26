import { appendAudit } from '@new-cms/cms/audit/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { credentialByEmail } from './adapters/postgres/credentials.ts';
import { issueSession, revokeSession } from './adapters/postgres/sessions.ts';
import { admitLogin } from './admission.ts';
import { assertRunning, databaseWork, secure } from './runtime.ts';
import type { IdentityDependencies } from './runtime.ts';
import { identityInputSchemas, loginSchema, parseInput } from './validation.ts';
import { bearerSchema } from './delegations/validation.ts';

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
    ctx.onAuthenticated?.(current.admin_id);
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
  const parsed = bearerSchema.safeParse(ctx.token);
  if (!parsed.success) fail('unauthenticated');
  const token = parsed.data;
  await secure(deps, ctx, async (tx) => {
    const { adminId, changed, authenticated } = await revokeSession(tx, {
      token,
      ctx,
      policy: deps.policy,
    });
    if (authenticated) ctx.onAuthenticated?.(adminId);
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
