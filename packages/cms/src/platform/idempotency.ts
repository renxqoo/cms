import { createHash, randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from './contracts.ts';
import type { Scope, ActorReference } from './contracts.ts';

export interface IdempotencyInput {
  actor: ActorReference;
  operationId: string;
  scope?: Scope;
  key: string | undefined;
  input: unknown;
  ttlMs: number;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

function fingerprint(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(input)))
    .digest('hex');
}

export async function withIdempotency<T>(
  tx: SqlExecutor,
  input: IdempotencyInput,
  work: () => Promise<T>,
): Promise<T> {
  if (!input.key || !/^[\x20-\x7e]{16,128}$/.test(input.key)) fail('invalid_input');
  const scope = input.scope?.collectionKey ? `collection:${input.scope.collectionKey}` : 'global';
  const key =
    input.actor.delegationId === null
      ? input.key
      : `\u0001${fingerprint([input.actor.delegationId, input.key])}`;
  const values = [input.actor.id, input.operationId, scope, key];
  await tx.query(
    'DELETE FROM idempotency_records WHERE actor_id=$1 AND operation_id=$2 AND scope_ref=$3 AND key=$4 AND expires_at<=clock_timestamp()',
    values,
  );
  const hash = fingerprint(input.input);
  const inserted = await tx.query(
    `INSERT INTO idempotency_records(id,actor_id,operation_id,scope_ref,key,fingerprint,expires_at)
     VALUES ($5,$1,$2,$3,$4,$6,clock_timestamp()+$7*interval '1 millisecond')
     ON CONFLICT(actor_id,operation_id,scope_ref,key) DO NOTHING RETURNING id`,
    [...values, randomUUID(), hash, input.ttlMs],
  );
  if (inserted.rowCount === 0) {
    const old = await tx.query<{ fingerprint: string; result: T; complete: boolean }>(
      'SELECT fingerprint,result,(result IS NOT NULL) AS complete FROM idempotency_records WHERE actor_id=$1 AND operation_id=$2 AND scope_ref=$3 AND key=$4',
      values,
    );
    const [row] = old.rows;
    if (!row || row.fingerprint !== hash || !row.complete) fail('idempotency_conflict');
    return row.result;
  }
  const result = await work();
  await tx.query(
    'UPDATE idempotency_records SET result=$5::jsonb WHERE actor_id=$1 AND operation_id=$2 AND scope_ref=$3 AND key=$4',
    [...values, JSON.stringify(result)],
  );
  return result;
}

export async function cleanupIdempotency(tx: SqlExecutor, batchSize: number): Promise<number> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) fail('invalid_input');
  const result = await tx.query(
    `DELETE FROM idempotency_records WHERE id IN
     (SELECT id FROM idempotency_records WHERE expires_at<=clock_timestamp()
      ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED)`,
    [batchSize],
  );
  return result.rowCount ?? 0;
}
