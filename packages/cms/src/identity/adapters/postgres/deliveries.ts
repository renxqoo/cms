import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import type { Delivery, TokenPurpose } from '../../types.ts';

export type FailureCode =
  | 'capacity'
  | 'transport_rejected'
  | 'transport_timeout'
  | 'transport_unknown'
  | 'state_unconfirmed'
  | 'interrupted';

export async function findDelivery(tx: SqlExecutor, id: string): Promise<Delivery | null> {
  const result = await tx.query<{
    id: string;
    status: Delivery['status'];
    created_at: Date;
    finished_at: Date | null;
  }>('SELECT id,status,created_at,finished_at FROM email_deliveries WHERE id=$1', [id]);
  const [row] = result.rows;
  return row
    ? {
        id: row.id,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        finishedAt: row.finished_at?.toISOString() ?? null,
      }
    : null;
}

export async function createDelivery(
  tx: SqlExecutor,
  input: {
    actionId: string;
    recipient: string;
    purpose: TokenPurpose;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.query(
    `INSERT INTO email_deliveries(id,action_token_id,recipient,template,created_at,updated_at)
    VALUES($1,$2,$3,$4,clock_timestamp(),clock_timestamp())`,
    [id, input.actionId, input.recipient, input.purpose],
  );
  return id;
}

export async function startDelivery(tx: SqlExecutor, id: string): Promise<boolean> {
  const result = await tx.query(
    `UPDATE email_deliveries SET status='sending',started_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1 AND status='pending'`,
    [id],
  );
  return result.rowCount === 1;
}

export async function finishDelivery(
  tx: SqlExecutor,
  input: {
    id: string;
    status: 'accepted' | 'failed' | 'unknown';
    failureCode?: FailureCode;
  },
): Promise<void> {
  await tx.query(
    `UPDATE email_deliveries SET status=$2,failure_code=$3,finished_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=$1 AND status IN ('pending','sending')`,
    [input.id, input.status, input.failureCode ?? null],
  );
}
