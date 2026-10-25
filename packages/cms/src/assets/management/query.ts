import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CleanupEntry } from './contracts.ts';

interface CleanupRow {
  id: string;
  state: CleanupEntry['state'];
  cleanup_blocked: boolean;
  cleanup_attempts: number;
  cleanup_failure_code: string | null;
  retain_until: Date;
  write_deadline: Date | null;
  next_cleanup_at: Date | null;
  created_at: Date;
}
const projection =
  'id,state,cleanup_blocked,cleanup_attempts,cleanup_failure_code,retain_until,write_deadline,next_cleanup_at,created_at';
function entry(row: CleanupRow): CleanupEntry {
  return {
    id: row.id,
    state: row.state,
    blocked: row.cleanup_blocked,
    attempts: row.cleanup_attempts,
    failureCode: row.cleanup_failure_code,
    retainUntil: row.retain_until.toISOString(),
    writeDeadline: row.write_deadline?.toISOString() ?? null,
    nextCleanupAt: row.next_cleanup_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function cleanupEntry(tx: SqlExecutor, id: string) {
  const result = await tx.query<CleanupRow>(`SELECT ${projection} FROM asset_objects WHERE id=$1`, [
    id,
  ]);
  const [row] = result.rows;
  if (!row) fail('not_found');
  return entry(row);
}

export async function cleanupPage(
  tx: SqlExecutor,
  input: {
    page: number;
    pageSize: number;
    blocked: boolean;
    state?: CleanupEntry['state'] | undefined;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  if (!Number.isSafeInteger(offset)) fail('invalid_input');
  const result = await tx.query<CleanupRow & { total: string }>(
    `WITH matches AS MATERIALIZED(SELECT ${projection} FROM asset_objects WHERE cleanup_blocked=$1 AND ($2::text IS NULL OR state=$2)),
     page AS(SELECT * FROM matches ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4)
     SELECT page.*,counts.total FROM(SELECT count(*) AS total FROM matches) counts LEFT JOIN page ON true
     ORDER BY page.created_at DESC,page.id DESC`,
    [input.blocked, input.state ?? null, input.pageSize, offset],
  );
  const total = Number(result.rows[0]?.total ?? 0);
  if (!Number.isSafeInteger(total)) fail('capacity_exceeded');
  return {
    rows: result.rows.filter((row) => row.id !== null).map(entry),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}
