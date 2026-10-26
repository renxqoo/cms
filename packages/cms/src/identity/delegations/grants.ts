import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy, Scope } from '@new-cms/cms/platform/contracts';
import type { CreateGrant, Credential, CredentialGrant, GrantRow } from './types.ts';
import { credentialGrantSchema } from './validation.ts';
import { randomToken, tokenDigest } from '../tokens.ts';

const projection =
  'g.*,c.name AS client_name,g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AS active';

export function grantOperations(row: GrantRow): CredentialGrant[] {
  const result = z.array(credentialGrantSchema).safeParse(row.grants);
  if (!result.success) fail('unauthenticated');
  return result.data;
}

export function includesGrant(
  grants: readonly CredentialGrant[],
  operationId: string,
  scope: Scope,
) {
  return grants.some(
    (grant) =>
      grant.operationId === operationId &&
      grant.scopeKind === scope.scopeKind &&
      grant.collectionKey === scope.collectionKey,
  );
}

export function delegationPermits(
  grants: readonly CredentialGrant[],
  operationId: string,
  scope: Scope,
) {
  if (
    scope.scopeKind === 'global' &&
    scope.collectionKey === null &&
    ['access.me', 'access.myOperations', 'collections.list', 'resources.list'].includes(operationId)
  )
    return true;
  return includesGrant(grants, operationId, scope);
}

export function credentialView(row: GrantRow): Credential {
  let status: Credential['status'] = 'active';
  if (!row.active) status = row.revoked_at ? 'revoked' : 'expired';
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    prefix: row.prefix,
    clientId: row.client_id,
    clientName: row.client_name,
    resource: row.resource,
    grants: grantOperations(row),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    revokedAt: row.revoked_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    status,
  };
}

export async function readGrant(tx: SqlExecutor, id: string): Promise<GrantRow> {
  const result = await tx.query<GrantRow>(
    `SELECT ${projection} FROM credential_grants g LEFT JOIN oauth_clients c ON c.id=g.client_id WHERE g.id=$1`,
    [id],
  );
  const [row] = result.rows;
  if (!row) fail('unauthenticated');
  return row;
}

export async function grantChain(
  tx: SqlExecutor,
  input: { id: string; adminId?: string; policy: CmsPolicy },
): Promise<GrantRow[]> {
  const result = await tx.query<GrantRow>(
    `WITH RECURSIVE chain AS (
      SELECT g.*,ARRAY[g.id] AS path FROM credential_grants g WHERE g.id=$1
      UNION ALL SELECT p.*,chain.path||p.id FROM credential_grants p JOIN chain ON chain.parent_id=p.id
      WHERE cardinality(chain.path)<$2 AND NOT p.id=ANY(chain.path)
    ) SELECT ${projection} FROM chain g LEFT JOIN oauth_clients c ON c.id=g.client_id ORDER BY cardinality(g.path)`,
    [input.id, input.policy.delegation.maxDepth],
  );
  const { rows } = result;
  const [first] = rows;
  if (
    !first ||
    rows.length !== first.depth ||
    rows.at(-1)?.parent_id !== null ||
    rows.some((row) => !row.active || row.admin_id !== first.admin_id) ||
    (input.adminId !== undefined && first.admin_id !== input.adminId)
  )
    fail('unauthenticated');
  return rows;
}

export async function assertGrantOperation(
  tx: SqlExecutor,
  input: { id: string; adminId: string; operationId: string; scope: Scope; policy: CmsPolicy },
): Promise<void> {
  const chain = await grantChain(tx, input);
  if (
    chain.some(
      (grant) => !delegationPermits(grantOperations(grant), input.operationId, input.scope),
    )
  )
    fail('forbidden');
}

async function checkGrantBudget(
  tx: SqlExecutor,
  adminId: string,
  policy: CmsPolicy,
): Promise<void> {
  const result = await tx.query<{ retained: string; active: string }>(
    'SELECT count(*) AS retained,count(*) FILTER(WHERE revoked_at IS NULL AND expires_at>clock_timestamp()) AS active FROM credential_grants WHERE admin_id=$1',
    [adminId],
  );
  const [count] = result.rows;
  if (
    !count ||
    Number(count.retained) >= policy.delegation.maxRetainedGrants ||
    Number(count.active) >= policy.delegation.maxActiveGrants
  )
    fail('capacity_exceeded');
}

async function parentDepth(
  tx: SqlExecutor,
  input: CreateGrant,
  policy: CmsPolicy,
): Promise<number> {
  const maximum =
    input.kind === 'api_key' ? policy.delegation.maxKeyTtlMs : policy.delegation.oauthTtlMs;
  const deadline = Date.parse(input.expiresAt);
  const now = await tx.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const timestamp = now.rows[0]?.now.getTime();
  if (
    timestamp === undefined ||
    !Number.isFinite(deadline) ||
    deadline <= timestamp ||
    deadline > timestamp + maximum
  )
    fail('invalid_input', {
      fieldErrors: [
        { field: 'expiresAt', message: 'The credential expiry is outside the allowed lifetime.' },
      ],
    });
  if (input.parentId === null) return 1;
  const chain = await grantChain(tx, { id: input.parentId, adminId: input.adminId, policy });
  if (
    chain.length >= policy.delegation.maxDepth ||
    chain.some(
      (row) =>
        deadline > row.expires_at.getTime() ||
        input.grants.some(
          (grant) => !delegationPermits(grantOperations(row), grant.operationId, grant),
        ),
    )
  )
    fail('forbidden');
  return chain.length + 1;
}

export async function createGrant(tx: SqlExecutor, input: CreateGrant, policy: CmsPolicy) {
  const depth = await parentDepth(tx, input, policy);
  await checkGrantBudget(tx, input.adminId, policy);
  const id = randomUUID();
  const apiKey = input.kind === 'api_key' ? `cmsk_${randomToken()}` : null;
  await tx.query(
    `INSERT INTO credential_grants(id,admin_id,parent_id,kind,name,resource,client_id,key_hash,prefix,grants,depth,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
    [
      id,
      input.adminId,
      input.parentId,
      input.kind,
      input.name,
      input.resource,
      input.clientId,
      apiKey ? tokenDigest(apiKey) : null,
      apiKey?.slice(0, 13) ?? null,
      JSON.stringify(input.grants),
      depth,
      input.expiresAt,
    ],
  );
  if (input.clientId !== null)
    await tx.query(
      "UPDATE oauth_clients SET expires_at=CASE WHEN expires_at IS NULL THEN NULL ELSE greatest(expires_at,$2::timestamptz+$3*interval '1 millisecond') END WHERE id=$1",
      [input.clientId, input.expiresAt, policy.delegation.clientTtlMs],
    );
  return { credential: credentialView(await readGrant(tx, id)), apiKey };
}
