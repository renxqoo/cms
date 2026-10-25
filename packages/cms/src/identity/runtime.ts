import type { Database, SqlExecutor } from '@new-cms/database/client';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { Mailer, PasswordHasher } from './types.ts';

export interface IdentityDependencies {
  database: Database;
  policy: CmsPolicy;
  passwords: PasswordHasher;
  mailer: Mailer;
}

export function secure<T>(
  deps: IdentityDependencies,
  ctx: RequestContext,
  work: (tx: SqlExecutor) => Promise<T>,
) {
  return securityTransaction(deps.database, deps.policy, {
    mode: 'exclusive',
    work,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
}

export async function databaseWork<T>(
  database: Database,
  work: (tx: SqlExecutor) => Promise<T>,
): Promise<T> {
  try {
    return await database.transaction(work);
  } catch (error) {
    if (error instanceof CmsError) throw error;
    return fail('temporarily_unavailable');
  }
}

export function assertRunning(ctx: RequestContext): void {
  if (ctx.signal?.aborted) fail('temporarily_unavailable');
}
