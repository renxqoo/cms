import { createHmac } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from './contracts.ts';

export interface RateLimitInput {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function rateLimitKey(secret: string, parts: readonly string[]): string {
  return createHmac('sha256', secret).update(JSON.stringify(parts)).digest('hex');
}

export async function consumeRateLimit(
  tx: SqlExecutor,
  input: RateLimitInput,
): Promise<RateLimitResult> {
  const result = await tx.query<{ count: number; retry_after: number }>(
    `INSERT INTO rate_limit_buckets (key, count, expires_at)
     VALUES ($1, 1, clock_timestamp() + $2 * interval '1 millisecond')
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limit_buckets.expires_at <= clock_timestamp()
         THEN 1 ELSE rate_limit_buckets.count + 1 END,
       expires_at = CASE WHEN rate_limit_buckets.expires_at <= clock_timestamp()
         THEN clock_timestamp() + $2 * interval '1 millisecond'
         ELSE rate_limit_buckets.expires_at END
     RETURNING count, greatest(1, ceil(extract(epoch FROM expires_at-clock_timestamp())))::int AS retry_after`,
    [input.key, input.windowMs],
  );
  const [row] = result.rows;
  if (!row) fail('temporarily_unavailable');
  return { allowed: row.count <= input.limit, retryAfterSeconds: row.retry_after };
}

export async function requireRateLimit(tx: SqlExecutor, input: RateLimitInput): Promise<void> {
  const result = await consumeRateLimit(tx, input);
  if (!result.allowed) fail('rate_limited', { retryAfterSeconds: result.retryAfterSeconds });
}

export async function cleanupRateLimits(tx: SqlExecutor, batchSize: number): Promise<number> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) fail('invalid_input');
  const result = await tx.query(
    `DELETE FROM rate_limit_buckets WHERE key IN
     (SELECT key FROM rate_limit_buckets WHERE expires_at<=clock_timestamp()
      ORDER BY expires_at,key LIMIT $1 FOR UPDATE SKIP LOCKED)`,
    [batchSize],
  );
  return result.rowCount ?? 0;
}
