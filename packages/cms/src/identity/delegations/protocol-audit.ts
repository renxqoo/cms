import type { SqlExecutor } from '@new-cms/database/client';
import { appendAudit } from '@new-cms/cms/audit/composition';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import type { GrantRow } from './types.ts';
import { revokeGrant } from './manage.ts';

export function observeGrant(ctx: RequestContext, grant: GrantRow): void {
  ctx.onAuthenticated?.(grant.admin_id);
  ctx.onCredential?.(grant.id);
}

export async function revokeProtocolGrant(
  tx: SqlExecutor,
  input: {
    grant: GrantRow;
    ctx: RequestContext;
    policy: CmsPolicy;
    reason: 'code_replay' | 'refresh_replay' | 'client_revoke';
  },
) {
  observeGrant(input.ctx, input.grant);
  const revoked = await revokeGrant(tx, input.grant.id);
  if (revoked > 0)
    await appendAudit(
      tx,
      {
        actorKind: 'admin',
        actorId: input.grant.admin_id,
        operationId: `oauth.${input.reason}`,
        targetType: 'credential',
        targetId: input.grant.id,
        requestId: input.ctx.requestId,
        detail: { revoked },
      },
      input.policy,
    );
}
