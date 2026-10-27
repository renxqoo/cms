import { createActorAuthorization } from './authorization.ts';
import type { ActorReference } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AccessRuntime } from './types.ts';

export interface AuthorIdentity {
  id: string;
  displayName: string | null;
}
export function createAuthorReader(runtime: AccessRuntime) {
  const authorize = createActorAuthorization(runtime);
  return async function readAuthor(
    tx: SqlExecutor,
    input: { viewer: ActorReference; id: string },
  ): Promise<AuthorIdentity | null> {
    await authorize(tx, {
      actor: input.viewer,
      operationId: 'admins.get',
      scope: { scopeKind: 'global', collectionKey: null },
    });
    const account = await runtime.identity.account(tx, input.id);
    return account ? { id: account.id, displayName: account.displayName } : null;
  };
}
export type AuthorReader = ReturnType<typeof createAuthorReader>;
