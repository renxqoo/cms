import { createHash } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';

export interface OrderScope {
  collection: string;
  scopeKey: string;
}
export interface OrderState {
  version: string;
  baseVersion: string;
  scopeVersion: string | null;
}

export function scopedOrderVersion(base: string, scope: string | null, key: string): string {
  if (key === '') return base;
  const bytes = createHash('sha256')
    .update(JSON.stringify([base, scope, key]))
    .digest();
  bytes[6] = ((bytes[6] ?? 0) & 15) | 80;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function readOrderState(
  tx: SqlExecutor,
  input: OrderScope & { lock?: boolean },
): Promise<OrderState | null> {
  const result = await tx.query<{ scope_key: string; version: string }>(
    `SELECT scope_key,version FROM content_order_control WHERE collection_id=$1 AND scope_key=ANY($2::text[]) ORDER BY scope_key${input.lock ? ' FOR UPDATE' : ''}`,
    [input.collection, ['', input.scopeKey]],
  );
  const base = result.rows.find((row) => row.scope_key === '');
  if (!base) return null;
  const scope =
    input.scopeKey === ''
      ? null
      : (result.rows.find((row) => row.scope_key === input.scopeKey)?.version ?? null);
  return {
    version: scopedOrderVersion(base.version, scope, input.scopeKey),
    baseVersion: base.version,
    scopeVersion: scope,
  };
}
