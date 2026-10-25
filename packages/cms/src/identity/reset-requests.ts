import { appendAudit } from '@new-cms/cms/audit/composition';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { credentialByEmail } from './adapters/postgres/credentials.ts';
import { tokenCooldown } from './adapters/postgres/action-tokens.ts';
import { admitReset } from './admission.ts';
import { createActionDelivery } from './invitations.ts';
import type { DeliveryExecutor } from './delivery-executor.ts';
import { secure } from './runtime.ts';
import type { IdentityDependencies } from './runtime.ts';
import { parseInput, resetRequestSchema } from './validation.ts';

export async function requestReset(
  deps: IdentityDependencies,
  ctx: RequestContext,
  options: {
    value: unknown;
    executor: DeliveryExecutor;
  },
): Promise<{ accepted: true }> {
  const input = parseInput(resetRequestSchema, options.value);
  await admitReset(deps, ctx);
  const issue = await secure(deps, ctx, async (tx) => {
    const account = await credentialByEmail(tx, input.email);
    if (account?.status !== 'active' || account.version === null) return null;
    if (
      await tokenCooldown(tx, {
        adminId: account.admin_id,
        purpose: 'password_reset',
        cooldownMs: deps.policy.resetCooldownMs,
      })
    )
      return null;
    const result = await createActionDelivery(
      tx,
      { policy: deps.policy, executor: options.executor },
      { adminId: account.admin_id, email: input.email, purpose: 'password_reset' },
    );
    await appendAudit(
      tx,
      {
        actorKind: 'system',
        operationId: 'identity.requestPasswordReset',
        targetType: 'admin',
        targetId: account.admin_id,
        requestId: ctx.requestId,
      },
      deps.policy,
    );
    return result;
  });
  issue?.dispatch();
  return { accepted: true };
}
