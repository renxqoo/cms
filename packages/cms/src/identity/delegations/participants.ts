import type { IdentityDependencies } from '../runtime.ts';
import type { RequestContext, Scope } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { CreateGrant } from './types.ts';
import { authenticateCredential } from './authentication.ts';
import {
  assertGrantOperation,
  createGrant,
  grantChain,
  grantOperations,
  delegationPermits,
} from './grants.ts';
import { listCredentials, managedCredential, revokeClientGrants, revokeGrant } from './manage.ts';
import { readAuthorization, decideAuthorization } from './requests.ts';
import { fail } from '@new-cms/cms/platform/contracts';

export function createDelegations(deps: IdentityDependencies) {
  return {
    authenticate: (tx: SqlExecutor, ctx: RequestContext) =>
      authenticateCredential(tx, ctx, deps.policy),
    create: (tx: SqlExecutor, input: CreateGrant) => createGrant(tx, input, deps.policy),
    list: listCredentials,
    managed: managedCredential,
    revoke: revokeGrant,
    revokeClient: revokeClientGrants,
    readAuthorization,
    decideAuthorization: (tx: SqlExecutor, input: Parameters<typeof decideAuthorization>[1]) =>
      decideAuthorization(tx, input, deps.policy),
    authorize: (
      tx: SqlExecutor,
      input: { id: string; adminId: string; operationId: string; scope: Scope },
    ) => assertGrantOperation(tx, { ...input, policy: deps.policy }),
    async authority(tx: SqlExecutor, input: { id: string; adminId: string }) {
      const chain = await grantChain(tx, { ...input, policy: deps.policy });
      const [first] = chain;
      if (!first) fail('unauthenticated');
      return grantOperations(first).filter((grant) =>
        chain.every((row) => delegationPermits(grantOperations(row), grant.operationId, grant)),
      );
    },
  };
}

export type DelegationParticipants = ReturnType<typeof createDelegations>;
