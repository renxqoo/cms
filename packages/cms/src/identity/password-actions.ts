import { appendAudit } from '@new-cms/cms/audit/composition';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import { credentialById, writeCredential } from './adapters/postgres/credentials.ts';
import { authenticate } from './adapters/postgres/sessions.ts';
import { consumeAction, validAction } from './adapters/postgres/action-tokens.ts';
import { revokeAccount } from './adapters/postgres/accounts.ts';
import { assertRunning, databaseWork, secure } from './runtime.ts';
import type { IdentityDependencies } from './runtime.ts';
import type { TokenPurpose } from './types.ts';
import { changePasswordSchema, consumeTokenSchema, parseInput } from './validation.ts';

export async function changePassword(
  deps: IdentityDependencies,
  ctx: RequestContext,
  value: unknown,
): Promise<void> {
  const input = parseInput(changePasswordSchema, value);
  const snapshot = await databaseWork(deps.database, async (tx) => {
    const account = await authenticate(tx, ctx);
    return credentialById(tx, account.id);
  });
  if (
    !snapshot ||
    !(await deps.passwords.verify(input.currentPassword, snapshot.password_hash, ctx.signal))
  )
    fail('invalid_credentials');
  const hash = await deps.passwords.hash(input.newPassword, ctx.signal);
  assertRunning(ctx);
  await secure(deps, ctx, async (tx) => {
    const account = await authenticate(tx, ctx);
    const current = await credentialById(tx, account.id);
    if (!current || current.admin_id !== snapshot.admin_id || current.version !== snapshot.version)
      fail('invalid_credentials');
    await writeCredential(tx, { adminId: account.id, hash });
    await revokeAccount(tx, account.id);
    await appendAudit(
      tx,
      {
        actorKind: 'admin',
        actorId: account.id,
        operationId: 'identity.changePassword',
        targetType: 'admin',
        targetId: account.id,
        requestId: ctx.requestId,
      },
      deps.policy,
    );
  });
}

export async function consumePasswordToken(
  deps: IdentityDependencies,
  ctx: RequestContext,
  options: {
    purpose: TokenPurpose;
    value: unknown;
  },
): Promise<void> {
  const input = parseInput(consumeTokenSchema, options.value);
  await databaseWork(deps.database, (tx) =>
    validAction(tx, { token: input.token, purpose: options.purpose }),
  );
  const hash = await deps.passwords.hash(input.newPassword, ctx.signal);
  assertRunning(ctx);
  await secure(deps, ctx, async (tx) => {
    const action = await validAction(tx, { token: input.token, purpose: options.purpose });
    await consumeAction(tx, action.id);
    await writeCredential(tx, { adminId: action.admin_id, hash });
    await revokeAccount(tx, action.admin_id);
    await appendAudit(
      tx,
      {
        actorKind: 'admin',
        actorId: action.admin_id,
        operationId:
          options.purpose === 'invitation' ? 'identity.acceptInvitation' : 'identity.resetPassword',
        targetType: 'admin',
        targetId: action.admin_id,
        requestId: ctx.requestId,
      },
      deps.policy,
    );
  });
}
