import type { Database } from '@new-cms/database/client';
import { rateLimitKey, requireRateLimit } from '@new-cms/cms/platform/rate-limits';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

interface Dependencies {
  database: Database;
  policy: CmsPolicy;
  publicReadIpRateLimit: number;
  verifyReady(signal?: AbortSignal): Promise<void>;
}

export function createAdmission(deps: Dependencies, accepting: () => boolean) {
  async function ready(signal?: AbortSignal): Promise<void> {
    if (!accepting()) throw new CmsError('temporarily_unavailable');
    try {
      await deps.verifyReady(signal);
    } catch {
      throw new CmsError('temporarily_unavailable');
    }
  }
  async function admitIp(
    ip: string,
    traffic: 'administration' | 'public-content' = 'administration',
  ): Promise<void> {
    if (!accepting()) throw new CmsError('temporarily_unavailable');
    try {
      await requireRateLimit(deps.database, {
        key: rateLimitKey(
          deps.policy.rateLimitSecret,
          traffic === 'public-content' ? ['http', 'public-content', ip] : ['http', ip],
        ),
        limit: traffic === 'public-content' ? deps.publicReadIpRateLimit : deps.policy.ipRateLimit,
        windowMs: deps.policy.rateWindowMs,
      });
    } catch (error) {
      if (error instanceof CmsError) throw error;
      throw new CmsError('temporarily_unavailable');
    }
  }
  return { ready, admitIp };
}
