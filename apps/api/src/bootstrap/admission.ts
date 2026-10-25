import type { Database } from '@new-cms/database/client';
import { rateLimitKey, requireRateLimit } from '@new-cms/cms/platform/rate-limits';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

interface Dependencies {
  database: Database;
  policy: CmsPolicy;
  verifyReady(): Promise<void>;
}

export function createAdmission(deps: Dependencies, accepting: () => boolean) {
  async function ready(): Promise<void> {
    if (!accepting()) throw new CmsError('temporarily_unavailable');
    try {
      await deps.verifyReady();
    } catch {
      throw new CmsError('temporarily_unavailable');
    }
  }
  async function admitIp(ip: string): Promise<void> {
    if (!accepting()) throw new CmsError('temporarily_unavailable');
    try {
      await requireRateLimit(deps.database, {
        key: rateLimitKey(deps.policy.rateLimitSecret, ['http', ip]),
        limit: deps.policy.ipRateLimit,
        windowMs: deps.policy.rateWindowMs,
      });
    } catch (error) {
      if (error instanceof CmsError) throw error;
      throw new CmsError('temporarily_unavailable');
    }
  }
  return { ready, admitIp };
}
