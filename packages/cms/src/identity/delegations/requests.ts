import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import type { AuthorizationRequest, CredentialGrant } from './types.ts';
import { createGrant, grantChain } from './grants.ts';
import { randomToken, tokenDigest } from '../tokens.ts';

export async function readAuthorization(
  tx: SqlExecutor,
  requestId: string,
): Promise<AuthorizationRequest> {
  const result = await tx.query<AuthorizationRequest>(
    'SELECT r.*,c.name AS client_name,r.expires_at>clock_timestamp() AS active FROM oauth_requests r JOIN oauth_clients c ON c.id=r.client_id WHERE r.id=$1',
    [requestId],
  );
  const [row] = result.rows;
  if (!row || !row.active) fail('token_invalid');
  return row;
}

export function authorizationRedirect(
  request: Pick<AuthorizationRequest, 'redirect_uri' | 'state' | 'issuer'>,
  values: Record<string, string>,
): string {
  const target = new URL(request.redirect_uri);
  for (const [key, value] of Object.entries(values)) target.searchParams.set(key, value);
  if (request.state !== null) target.searchParams.set('state', request.state);
  target.searchParams.set('iss', request.issuer);
  return target.href;
}

async function authorizationExpiry(
  tx: SqlExecutor,
  input: { parentId: string | null; adminId: string },
  policy: CmsPolicy,
): Promise<string> {
  const now = await tx.query<{ deadline: Date }>(
    "SELECT clock_timestamp()+$1*interval '1 millisecond' AS deadline",
    [policy.delegation.oauthTtlMs],
  );
  const base = now.rows[0]?.deadline.getTime();
  if (base === undefined) fail('internal_error');
  const parents = input.parentId
    ? await grantChain(tx, { id: input.parentId, adminId: input.adminId, policy })
    : [];
  return new Date(Math.min(base, ...parents.map((row) => row.expires_at.getTime()))).toISOString();
}

export async function decideAuthorization(
  tx: SqlExecutor,
  input: {
    request: AuthorizationRequest;
    approved: boolean;
    adminId: string;
    parentId: string | null;
    grants: CredentialGrant[];
    name?: string;
  },
  policy: CmsPolicy,
): Promise<{ redirectTo: string }> {
  if (input.request.status !== 'pending') fail('token_invalid');
  if (!input.approved) {
    const result = await tx.query(
      "UPDATE oauth_requests SET status='denied' WHERE id=$1 AND status='pending' AND expires_at>clock_timestamp()",
      [input.request.id],
    );
    if (result.rowCount !== 1) fail('token_invalid');
    return { redirectTo: authorizationRedirect(input.request, { error: 'access_denied' }) };
  }
  const result = await createGrant(
    tx,
    {
      adminId: input.adminId,
      parentId: input.parentId,
      kind: 'oauth',
      name: input.name ?? input.request.client_name,
      resource: input.request.resource,
      clientId: input.request.client_id,
      expiresAt: await authorizationExpiry(tx, input, policy),
      grants: input.grants,
    },
    policy,
  );
  const code = `cmsc_${randomToken()}`;
  const consumed = await tx.query(
    "UPDATE oauth_requests SET status='approved',grant_id=$2,code_hash=$3,expires_at=clock_timestamp()+$4*interval '1 millisecond' WHERE id=$1 AND status='pending' AND expires_at>clock_timestamp()",
    [input.request.id, result.credential.id, tokenDigest(code), policy.delegation.codeTtlMs],
  );
  if (consumed.rowCount !== 1) fail('token_invalid');
  return { redirectTo: authorizationRedirect(input.request, { code }) };
}
