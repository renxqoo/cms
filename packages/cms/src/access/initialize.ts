import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { displayNameSchema } from '@new-cms/cms/identity';
import { fail } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { effectiveSuperCount } from './adapters/postgres/authorization-store.ts';
import { allResources } from './adapters/postgres/resource-store.ts';
import { adminProjection } from './admins.ts';
import type { AccessRuntime } from './types.ts';
import { parse } from './validation.ts';

const initializeSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(255),
  displayName: displayNameSchema.default(null),
  password: z.unknown(),
});

export function createInitializer(runtime: AccessRuntime) {
  return async function initializeAdmin(input: unknown) {
    const { password, ...profile } = parse(initializeSchema, input);
    const passwordHash = await runtime.identity.preparePassword(password);
    return securityTransaction(runtime.database, runtime.policy, {
      mode: 'exclusive',
      async work(tx) {
        if ((await effectiveSuperCount(tx)) > 0) fail('protected_resource');
        const role = (await allResources(tx, 'roles')).find(
          (item) => item.isSuper && item.status === 'active',
        );
        if (!role) fail('temporarily_unavailable');
        const account = await runtime.identity.initializeAccount(tx, {
          ...profile,
          roleId: role.id,
          passwordHash,
        });
        await appendAudit(
          tx,
          {
            actorKind: 'system',
            operationId: 'access.initializeAdmin',
            targetType: 'admin',
            targetId: account.id,
            requestId: randomUUID(),
            detail: { roleId: role.id },
          },
          runtime.policy,
        );
        return adminProjection(account, role);
      },
    });
  };
}
