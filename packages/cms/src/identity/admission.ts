import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { consumeRateLimit, rateLimitKey } from '@new-cms/cms/platform/rate-limits';
import type { RateLimitResult } from '@new-cms/cms/platform/rate-limits';
import { databaseWork } from './runtime.ts';
import type { IdentityDependencies } from './runtime.ts';

function requireResults(results: RateLimitResult[]): void {
  const denied = results.filter((result) => !result.allowed);
  if (denied.length > 0)
    fail('rate_limited', {
      retryAfterSeconds: Math.max(...denied.map((result) => result.retryAfterSeconds)),
    });
}

export async function admitLogin(
  deps: IdentityDependencies,
  ctx: RequestContext,
  email: string,
): Promise<void> {
  const { policy } = deps;
  const results = await databaseWork(deps.database, async (tx) => [
    await consumeRateLimit(tx, {
      key: rateLimitKey(policy.rateLimitSecret, ['login-ip', ctx.ip]),
      limit: policy.loginIpLimit,
      windowMs: policy.rateWindowMs,
    }),
    await consumeRateLimit(tx, {
      key: rateLimitKey(policy.rateLimitSecret, ['login-email-ip', email, ctx.ip]),
      limit: policy.loginEmailIpLimit,
      windowMs: policy.rateWindowMs,
    }),
  ]);
  requireResults(results);
}

export async function admitReset(deps: IdentityDependencies, ctx: RequestContext): Promise<void> {
  const { policy } = deps;
  const result = await databaseWork(deps.database, (tx) =>
    consumeRateLimit(tx, {
      key: rateLimitKey(policy.rateLimitSecret, ['reset-ip', ctx.ip]),
      limit: policy.resetIpLimit,
      windowMs: policy.rateWindowMs,
    }),
  );
  requireResults([result]);
}
