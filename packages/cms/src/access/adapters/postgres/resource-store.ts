import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Page } from '../../types.ts';
import { escapedSearch } from '../../validation.ts';
import { projectResource, resourceColumns } from './resource-projections.ts';
import type { AccessTable, ResourceMap } from './resource-projections.ts';

function column(name: string) {
  return name.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function projection(table: AccessTable) {
  return resourceColumns[table].map((name) => `${column(name)} AS "${name}"`).join(',');
}

export async function findResource<K extends AccessTable>(
  tx: SqlExecutor,
  target: { table: K; id: string },
): Promise<ResourceMap[K] | null> {
  const result = await tx.query<Record<string, unknown>>(
    `SELECT ${projection(target.table)} FROM ${target.table} WHERE id=$1`,
    [target.id],
  );
  const [row] = result.rows;
  return row ? projectResource(target.table, row) : null;
}

export async function resource<K extends AccessTable>(
  tx: SqlExecutor,
  target: { table: K; id: string },
): Promise<ResourceMap[K]> {
  const result = await findResource(tx, target);
  if (result === null) fail('not_found');
  return result;
}

export async function insertResource<K extends AccessTable>(
  tx: SqlExecutor,
  input: { table: K; values: object },
): Promise<ResourceMap[K]> {
  const entries: [string, unknown][] = Object.entries(input.values);
  const fields = entries.map(([name]) => column(name)).join(',');
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(',');
  const result = await tx.query<Record<string, unknown>>(
    `INSERT INTO ${input.table} (${fields}) VALUES (${placeholders}) RETURNING ${projection(input.table)}`,
    entries.map(([, value]) => value),
  );
  const [row] = result.rows;
  if (!row) fail('internal_error');
  return projectResource(input.table, row);
}

export async function updateResource<K extends AccessTable>(
  tx: SqlExecutor,
  input: { table: K; id: string; version: number; values: object },
): Promise<ResourceMap[K]> {
  const entries: [string, unknown][] = Object.entries(input.values);
  const assignments = entries.map(([name], index) => `${column(name)}=$${index + 3}`).join(',');
  const result = await tx.query<Record<string, unknown>>(
    `UPDATE ${input.table} SET ${assignments},version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$2 RETURNING ${projection(input.table)}`,
    [input.id, input.version, ...entries.map(([, value]) => value)],
  );
  const [row] = result.rows;
  if (!row) fail('version_conflict');
  return projectResource(input.table, row);
}

export async function deleteResource(tx: SqlExecutor, input: { table: AccessTable; id: string }) {
  await tx.query(`DELETE FROM ${input.table} WHERE id=$1`, [input.id]);
}

export async function enforceCapacity(
  tx: SqlExecutor,
  input: { table: AccessTable; maximum: number },
) {
  const result = await tx.query<{ count: string }>(`SELECT count(*) FROM ${input.table}`);
  if (Number(result.rows[0]?.count) >= input.maximum) fail('capacity_exceeded');
}

export function changes(current: object, next: object) {
  const previous = new Map<string, unknown>(Object.entries(current));
  return Object.fromEntries<unknown>(
    Object.entries(next).filter(
      ([key, value]) =>
        key !== 'id' && key !== 'version' && value !== undefined && previous.get(key) !== value,
    ),
  );
}

interface ListInput<K extends 'roles' | 'permissions'> {
  table: K;
  page: number;
  pageSize: number;
  q: string;
  order: 'asc' | 'desc';
  sortBy: string;
  status?: string | undefined;
  scopeKind?: string | undefined;
  collectionKey?: string | undefined;
}

function listConditions(input: ListInput<'roles' | 'permissions'>) {
  const values: unknown[] = [escapedSearch(input.q)];
  const conditions = ["(code ILIKE $1 ESCAPE '\\' OR name ILIKE $1 ESCAPE '\\')"];
  for (const key of ['status', 'scopeKind', 'collectionKey'] as const) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    conditions.push(`${column(key)}=$${values.length}`);
  }
  return { values, sql: conditions.join(' AND ') };
}

export async function listResources<K extends 'roles' | 'permissions'>(
  tx: SqlExecutor,
  input: ListInput<K>,
): Promise<Page<ResourceMap[K]>> {
  const where = listConditions(input);
  const count = await tx.query<{ count: string }>(
    `SELECT count(*) FROM ${input.table} WHERE ${where.sql}`,
    where.values,
  );
  const offset = (input.page - 1) * input.pageSize;
  if (!Number.isSafeInteger(offset)) fail('invalid_input');
  const values = [...where.values, input.pageSize, offset];
  const order = `${column(input.sortBy)} ${input.order},id ${input.order}`;
  const result = await tx.query<Record<string, unknown>>(
    `SELECT ${projection(input.table)} FROM ${input.table} WHERE ${where.sql} ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    rows: result.rows.map((row) => projectResource(input.table, row)),
    total: Number(count.rows[0]?.count),
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function allResources<K extends AccessTable>(
  tx: SqlExecutor,
  table: K,
): Promise<ResourceMap[K][]> {
  const result = await tx.query<Record<string, unknown>>(
    `SELECT ${projection(table)} FROM ${table} ORDER BY id`,
  );
  return result.rows.map((row) => projectResource(table, row));
}
