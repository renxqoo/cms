import type {
  PhysicalColumn,
  PhysicalForeignKey,
  PhysicalIndex,
  PhysicalPlan,
  PhysicalTable,
} from '../schema-plan.ts';
import { validatePlan } from './render.ts';
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}
function column(value: unknown): value is PhysicalColumn {
  if (!record(value) || !keys(value, ['name', 'type', 'nullable', 'default', 'generated']))
    return false;
  if (
    typeof value['name'] !== 'string' ||
    typeof value['type'] !== 'string' ||
    ![
      'uuid',
      'text',
      'integer',
      'bigint',
      'double precision',
      'boolean',
      'timestamptz',
      'jsonb',
      'tsvector',
    ].includes(value['type']) ||
    !optionalBoolean(value['nullable'])
  )
    return false;
  if (
    value['default'] !== undefined &&
    (typeof value['default'] !== 'string' ||
      !['now()', 'gen_random_uuid()', '0', '1', 'false', 'true'].includes(value['default']))
  )
    return false;
  const { generated } = value;
  return (
    generated === undefined ||
    (record(generated) &&
      keys(generated, ['kind', 'column']) &&
      generated['kind'] === 'textSearch' &&
      typeof generated['column'] === 'string')
  );
}
function index(value: unknown): value is PhysicalIndex {
  if (!record(value) || !keys(value, ['name', 'columns', 'unique', 'where', 'method']))
    return false;
  if (
    typeof value['name'] !== 'string' ||
    !strings(value['columns']) ||
    !optionalBoolean(value['unique'])
  )
    return false;
  if (value['method'] !== undefined && value['method'] !== 'btree' && value['method'] !== 'gin')
    return false;
  return indexWhere(value['where']);
}
function foreignKey(value: unknown): value is PhysicalForeignKey {
  if (
    !record(value) ||
    !keys(value, ['name', 'columns', 'targetTable', 'targetColumns', 'onDelete', 'deferrable'])
  )
    return false;
  return (
    typeof value['name'] === 'string' &&
    strings(value['columns']) &&
    typeof value['targetTable'] === 'string' &&
    strings(value['targetColumns']) &&
    (value['onDelete'] === 'cascade' || value['onDelete'] === 'restrict') &&
    optionalBoolean(value['deferrable'])
  );
}
function table(value: unknown): value is PhysicalTable {
  if (
    !record(value) ||
    !keys(value, ['name', 'columns', 'primaryKey', 'unique', 'indexes', 'foreignKeys'])
  )
    return false;
  if (
    typeof value['name'] !== 'string' ||
    !Array.isArray(value['columns']) ||
    !value['columns'].every(column) ||
    !strings(value['primaryKey'])
  )
    return false;
  if (
    value['unique'] !== undefined &&
    (!Array.isArray(value['unique']) || !value['unique'].every(strings))
  )
    return false;
  return (
    Array.isArray(value['indexes']) &&
    value['indexes'].every(index) &&
    Array.isArray(value['foreignKeys']) &&
    value['foreignKeys'].every(foreignKey)
  );
}
function physicalPlan(value: unknown): value is PhysicalPlan {
  return (
    record(value) &&
    keys(value, ['version', 'tables']) &&
    value['version'] === 1 &&
    Array.isArray(value['tables']) &&
    value['tables'].every(table)
  );
}
export function parsePhysicalPlan(value: unknown): PhysicalPlan {
  if (!physicalPlan(value)) throw new Error('Invalid physical plan');
  validatePlan(value);
  return structuredClone(value);
}

function indexWhere(where: unknown): boolean {
  if (where === undefined) return true;
  if (!record(where) || !keys(where, ['column', 'equals']) || typeof where['column'] !== 'string')
    return false;
  const expected = where['equals'];
  return (
    typeof expected === 'string' ||
    typeof expected === 'boolean' ||
    (typeof expected === 'number' && Number.isFinite(expected))
  );
}
