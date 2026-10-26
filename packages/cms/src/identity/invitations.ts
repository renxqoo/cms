import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import { consumeRateLimit, rateLimitKey } from '@new-cms/cms/platform/rate-limits';
import { findAccount } from './adapters/postgres/accounts.ts';
import { authenticate } from './adapters/postgres/sessions.ts';
import { issueAction, tokenCooldown } from './adapters/postgres/action-tokens.ts';
import { createDelivery } from './adapters/postgres/deliveries.ts';
import type { DeliveryExecutor } from './delivery-executor.ts';
import type { InvitationIssue, TokenPurpose } from './types.ts';

export interface IssueDependencies {
  policy: CmsPolicy;
  executor: DeliveryExecutor;
}

export async function createActionDelivery(
  tx: SqlExecutor,
  deps: IssueDependencies,
  input: {
    adminId: string;
    email: string;
    purpose: TokenPurpose;
  },
): Promise<InvitationIssue> {
  const ttlMs =
    input.purpose === 'invitation' ? deps.policy.invitationTtlMs : deps.policy.resetTtlMs;
  const action = await issueAction(tx, { adminId: input.adminId, purpose: input.purpose, ttlMs });
  const id = await createDelivery(tx, {
    actionId: action.id,
    recipient: input.email,
    purpose: input.purpose,
  });
  let secret = action.token;
  return {
    delivery: { id, status: 'pending' },
    dispatch: () => {
      const token = secret;
      secret = '';
      if (token) deps.executor.dispatch({ id, to: input.email, purpose: input.purpose, token });
    },
  };
}

async function checkInvitationLimit(tx: SqlExecutor, policy: CmsPolicy, ctx: RequestContext) {
  const actor = await authenticate(tx, ctx, policy);
  const result = await consumeRateLimit(tx, {
    key: rateLimitKey(policy.rateLimitSecret, ['invite-actor', actor.id]),
    limit: policy.invitationActorLimit,
    windowMs: policy.rateWindowMs,
  });
  if (!result.allowed) fail('rate_limited', { retryAfterSeconds: result.retryAfterSeconds });
}

export async function issueInvitation(
  tx: SqlExecutor,
  deps: IssueDependencies,
  input: {
    adminId: string;
    ctx: RequestContext;
  },
): Promise<InvitationIssue> {
  const account = await findAccount(tx, input.adminId);
  if (!account) fail('not_found');
  if (account.status !== 'active' || account.activation !== 'pending') fail('protected_resource');
  await checkInvitationLimit(tx, deps.policy, input.ctx);
  const cooling = await tokenCooldown(tx, {
    adminId: account.id,
    purpose: 'invitation',
    cooldownMs: deps.policy.invitationCooldownMs,
  });
  if (cooling)
    fail('rate_limited', { retryAfterSeconds: Math.ceil(deps.policy.invitationCooldownMs / 1000) });
  return createActionDelivery(tx, deps, {
    adminId: account.id,
    email: account.email,
    purpose: 'invitation',
  });
}
