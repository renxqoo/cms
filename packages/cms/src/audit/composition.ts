import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '../platform/contracts.ts';
import type { CmsPolicy } from '../platform/contracts.ts';
import type { AuditEvent, AuditList, AuditQuery, AuditRow } from './index.ts';

function assertSafeDetail(value: unknown, depth = 0): void {
  if (depth > 16) fail('invalid_input');
  if (typeof value === 'string' && /Bearer\s|[?&#](?:token|password)=/i.test(value))
    fail('invalid_input');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('invalid_input');
  if (Array.isArray(value)) {
    for (const item of value) assertSafeDetail(item, depth + 1);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/password|token|authorization|cookie|secret|smtp|body|hash/i.test(key))
        fail('invalid_input');
      assertSafeDetail(item, depth + 1);
    }
  }
}

export async function appendAudit(
  tx: SqlExecutor,
  event: AuditEvent,
  policy: CmsPolicy,
): Promise<void> {
  assertSafeDetail(event.detail);
  const detail = JSON.stringify(event.detail ?? {});
  if (Buffer.byteLength(detail, 'utf8') > policy.maxAuditBytes) fail('invalid_input');
  await tx.query(
    `INSERT INTO audit_events(id,actor_kind,actor_id,operation_id,target_type,target_id,request_id,detail)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      randomUUID(),
      event.actorKind,
      event.actorId ?? null,
      event.operationId,
      event.targetType,
      event.targetId ?? null,
      event.requestId,
      detail,
    ],
  );
}

function auditFilters(input: AuditQuery): { where: string; values: unknown[] } {
  const filters: string[] = [];
  const values: unknown[] = [];
  if (input.q !== undefined && input.q.length > 0) {
    values.push(`%${input.q.replace(/[\\%_]/g, '\\$&')}%`);
    filters.push(
      `(operation_id ILIKE $1 OR target_type ILIKE $1 OR target_id ILIKE $1 OR request_id ILIKE $1)`,
    );
  }
  const fields = [
    ['actorId', 'actor_id'],
    ['operationId', 'operation_id'],
    ['targetType', 'target_type'],
    ['targetId', 'target_id'],
  ] as const;
  for (const [field, column] of fields) {
    const value = input[field];
    if (value !== undefined) {
      values.push(value);
      filters.push(`${column}=$${values.length}`);
    }
  }
  for (const [value, operator] of [
    [input.from, '>='],
    [input.to, '<='],
  ]) {
    if (value !== undefined) {
      values.push(value);
      filters.push(`created_at${operator}$${values.length}::timestamptz`);
    }
  }
  return { where: filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '', values };
}

function validateQuery(input: AuditQuery, policy: CmsPolicy): void {
  if (input.q !== undefined && input.q.length > 128) fail('invalid_input');
  if (!Number.isSafeInteger(input.page) || input.page < 1) fail('invalid_input');
  if (
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > policy.maxPageSize
  )
    fail('invalid_input');
  if (!Number.isSafeInteger((input.page - 1) * input.pageSize)) fail('invalid_input');
  if (input.order !== undefined && input.order !== 'asc' && input.order !== 'desc')
    fail('invalid_input');
}

export async function readAudit(
  tx: SqlExecutor,
  input: AuditQuery,
  policy: CmsPolicy,
): Promise<AuditList> {
  validateQuery(input, policy);
  const filters = auditFilters(input);
  const order = input.order === 'asc' ? 'ASC' : 'DESC';
  const total = await tx.query<{ total: string }>(
    `SELECT count(*) AS total FROM audit_events ${filters.where}`,
    filters.values,
  );
  const count = filters.values.length;
  const rows = await tx.query<Omit<AuditRow, 'createdAt'> & { createdAt: Date }>(
    `SELECT id,actor_kind AS "actorKind",actor_id AS "actorId",operation_id AS "operationId",
     target_type AS "targetType",target_id AS "targetId",request_id AS "requestId",detail,created_at AS "createdAt"
     FROM audit_events ${filters.where} ORDER BY created_at ${order},id ${order}
     LIMIT $${count + 1} OFFSET $${count + 2}`,
    [...filters.values, input.pageSize, (input.page - 1) * input.pageSize],
  );
  return {
    rows: rows.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total: Number(total.rows[0]?.total ?? 0),
    page: input.page,
    pageSize: input.pageSize,
  };
}
