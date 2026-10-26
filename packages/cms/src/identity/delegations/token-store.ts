import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import { requireRateLimit, rateLimitKey } from '@new-cms/cms/platform/rate-limits';
import type { Credential, GrantRow, TokenResult } from './types.ts';
import { randomToken, tokenDigest } from '../tokens.ts';

export interface TokenRow {
  id: string;
  grant_id: string;
  resource: Credential['resource'];
  expires_at: Date;
  consumed_at: Date | null;
  active: boolean;
  scopes: string[];
}

async function tokenBudget(
  tx: SqlExecutor,
  input: { grant: GrantRow; policy: CmsPolicy; refresh: boolean },
): Promise<void> {
  const { grant: row, policy, refresh } = input;
  await tx.query(
    "DELETE FROM credential_tokens WHERE id IN(SELECT id FROM credential_tokens WHERE grant_id=$1 AND kind='access' AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT $2)",
    [row.id, policy.delegation.cleanupBatchSize],
  );
  const result = await tx.query<{ access: string; refresh: string }>(
    "SELECT count(*) FILTER(WHERE kind='access') AS access,count(*) FILTER(WHERE kind='refresh') AS refresh FROM credential_tokens WHERE grant_id=$1",
    [row.id],
  );
  const [count] = result.rows;
  if (
    !count ||
    Number(count.access) >= policy.delegation.maxAccessTokens ||
    (refresh && Number(count.refresh) >= policy.delegation.maxRefreshTokens)
  )
    fail('capacity_exceeded');
}

async function admitIssuance(tx: SqlExecutor, grant: GrantRow, policy: CmsPolicy): Promise<void> {
  for (const dimension of [
    ['oauth-owner', grant.admin_id],
    ['oauth-credential', grant.id],
  ])
    await requireRateLimit(tx, {
      key: rateLimitKey(policy.rateLimitSecret, dimension),
      limit: policy.userRateLimit,
      windowMs: policy.rateWindowMs,
    });
}

export async function issueAccess(
  tx: SqlExecutor,
  input: {
    grant: GrantRow;
    resource: Credential['resource'];
    policy: CmsPolicy;
    scopes: readonly string[];
    refresh: boolean;
  },
): Promise<TokenResult> {
  await tokenBudget(tx, input);
  await admitIssuance(tx, input.grant, input.policy);
  const token = `cmsa_${randomToken()}`;
  const issued = await tx.query<{ expires_at: Date; seconds: number }>(
    `INSERT INTO credential_tokens(id,grant_id,kind,resource,token_hash,expires_at,scopes)
     VALUES($1,$2,'access',$3,$4,least($5::timestamptz,clock_timestamp()+$6*interval '1 millisecond'),$7)
     RETURNING expires_at,greatest(1,floor(extract(epoch FROM expires_at-clock_timestamp())))::int AS seconds`,
    [
      randomUUID(),
      input.grant.id,
      input.resource,
      tokenDigest(token),
      input.grant.expires_at,
      input.policy.delegation.accessTtlMs,
      input.scopes,
    ],
  );
  const [row] = issued.rows;
  if (!row) fail('internal_error');
  const result: TokenResult = {
    access_token: token,
    token_type: 'Bearer',
    expires_in: row.seconds,
    scope: input.scopes.join(' '),
  };
  if (input.refresh) result.refresh_token = await issueRefresh(tx, input);
  return result;
}

async function issueRefresh(
  tx: SqlExecutor,
  input: { grant: GrantRow; resource: Credential['resource']; scopes: readonly string[] },
): Promise<string> {
  const token = `cmsr_${randomToken()}`;
  await tx.query(
    "INSERT INTO credential_tokens(id,grant_id,kind,resource,token_hash,expires_at,scopes) VALUES($1,$2,'refresh',$3,$4,$5,$6)",
    [
      randomUUID(),
      input.grant.id,
      input.resource,
      tokenDigest(token),
      input.grant.expires_at,
      input.scopes,
    ],
  );
  return token;
}

export async function refreshToken(tx: SqlExecutor, token: string): Promise<TokenRow | null> {
  const result = await tx.query<TokenRow>(
    "SELECT *,expires_at>clock_timestamp() AS active FROM credential_tokens WHERE token_hash=$1 AND kind='refresh' FOR UPDATE",
    [tokenDigest(token)],
  );
  return result.rows[0] ?? null;
}
