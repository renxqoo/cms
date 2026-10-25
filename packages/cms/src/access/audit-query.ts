import { readAudit } from '@new-cms/cms/audit/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner } from './runtime.ts';
import type { AccessRuntime } from './types.ts';
import { parse } from './validation.ts';

export function createAuditApi(runtime: AccessRuntime) {
  return {
    listAuditLogs(ctx: RequestContext, input: unknown) {
      return createRunner(runtime)({ ctx, operationId: 'audit.list', mode: 'shared' }, ({ tx }) => {
        const { sortBy: _sortBy, ...query } = parse(runtime.schemas['audit.list'], input);
        if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to))
          fail('invalid_input');
        return readAudit(
          tx,
          {
            page: query.page,
            pageSize: query.pageSize,
            order: query.order,
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.operationId ? { operationId: query.operationId } : {}),
            ...(query.targetType ? { targetType: query.targetType } : {}),
            ...(query.targetId ? { targetId: query.targetId } : {}),
            ...(query.from ? { from: query.from } : {}),
            ...(query.to ? { to: query.to } : {}),
            ...(query.q ? { q: query.q } : {}),
          },
          runtime.policy,
        );
      });
    },
  };
}
