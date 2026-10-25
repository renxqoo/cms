import { createHash } from 'node:crypto';
import type {
  PhysicalColumn,
  PhysicalForeignKey,
  PhysicalIndex,
  PhysicalPlan,
  PhysicalTable,
} from '../schema-plan.ts';

export function identifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new Error('Invalid physical identifier');
  return `"${value}"`;
}
function names(values: readonly string[]): string {
  return values.map(identifier).join(',');
}
export function columnSql(column: PhysicalColumn): string {
  return `${identifier(column.name)} ${column.type}${column.generated ? ` GENERATED ALWAYS AS (to_tsvector('simple',coalesce(${identifier(column.generated.column)},''))) STORED` : ''}${column.nullable ? '' : ' NOT NULL'}${column.default ? ` DEFAULT ${column.default}` : ''}`;
}
export function foreignSql(key: PhysicalForeignKey): string {
  return `CONSTRAINT ${identifier(key.name)} FOREIGN KEY (${names(key.columns)}) REFERENCES ${identifier(key.targetTable)} (${names(key.targetColumns)}) ON DELETE ${key.onDelete.toUpperCase()}${key.deferrable ? ' DEFERRABLE INITIALLY DEFERRED' : ''}`;
}
function literal(value: string | number | boolean): string {
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  return String(value);
}
export function indexSql(table: PhysicalTable, index: PhysicalIndex): string {
  const where = index.where
    ? ` WHERE ${identifier(index.where.column)}=${literal(index.where.equals)}`
    : '';
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${identifier(index.name)} ON ${identifier(table.name)} USING ${index.method ?? 'btree'} (${names(index.columns)})${where};`;
}
export function tableSql(table: PhysicalTable): string {
  const columns = table.columns.map(columnSql);
  columns.push(`PRIMARY KEY (${names(table.primaryKey)})`);
  for (const unique of table.unique ?? []) columns.push(`UNIQUE (${names(unique)})`);
  columns.push(...table.foreignKeys.map(foreignSql));
  return `CREATE TABLE ${identifier(table.name)} (\n  ${columns.join(',\n  ')}\n);\n${table.indexes.map((index) => indexSql(table, index)).join('\n')}`;
}
export function renderSql(plan: PhysicalPlan): string {
  validatePlan(plan);
  return `${plan.tables.map(tableSql).join('\n')}\n`;
}
export function planFingerprint(plan: PhysicalPlan): string {
  return createHash('sha256').update(renderSql(plan)).digest('hex');
}
function validateTable(table: PhysicalTable): void {
  identifier(table.name);
  const columns = new Set<string>();
  for (const column of table.columns) {
    identifier(column.name);
    if (columns.has(column.name)) throw new Error('Duplicate physical column');
    columns.add(column.name);
    if (
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
      ].includes(column.type)
    )
      throw new Error('Invalid physical type');
    if (
      column.default &&
      !['now()', 'gen_random_uuid()', '0', '1', 'false', 'true'].includes(column.default)
    )
      throw new Error('Invalid physical default');
  }
  for (const column of [
    ...table.primaryKey,
    ...table.indexes.flatMap((index) => index.columns),
    ...(table.unique ?? []).flat(),
  ]) {
    if (!columns.has(column)) throw new Error('Unknown physical column');
  }
  for (const key of table.foreignKeys) {
    if (key.columns.length !== key.targetColumns.length)
      throw new Error('Invalid physical foreign key');
    for (const column of key.columns)
      if (!columns.has(column)) throw new Error('Unknown physical foreign key column');
  }
}
export function validatePlan(plan: PhysicalPlan): void {
  if (plan.version !== 1) throw new Error('Unsupported physical plan');
  const seen = new Set<string>();
  for (const table of plan.tables) {
    validateTable(table);
    if (seen.has(table.name)) throw new Error('Duplicate physical table');
    seen.add(table.name);
  }
}
function drizzleColumn(column: PhysicalColumn): string {
  const builders = {
    uuid: 'uuid',
    text: 'text',
    integer: 'integer',
    bigint: 'bigint',
    'double precision': 'doublePrecision',
    boolean: 'boolean',
    timestamptz: 'timestamp',
    jsonb: 'jsonb',
    tsvector: 'customType',
  };
  let result =
    column.type === 'tsvector'
      ? `(pg.customType<{data:string}>({dataType:() => 'tsvector'}))(`
      : `pg.${builders[column.type]}(`;
  result += JSON.stringify(column.name);
  if (column.type === 'timestamptz') result += ', { withTimezone: true }';
  if (column.type === 'bigint') result += ", { mode: 'number' }";
  result += ')';
  if (!column.nullable) result += '.notNull()';
  if (column.generated)
    result += `.generatedAlwaysAs(sql\`to_tsvector('simple',coalesce(${identifier(column.generated.column)},''))\`)`;
  if (column.default === 'now()') result += '.defaultNow()';
  else if (column.default) result += `.default(sql\`${column.default}\`)`;
  return result;
}
function drizzleTable(table: PhysicalTable, plan: PhysicalPlan): string {
  const fields = table.columns
    .map((column) => `  ${column.name}: ${drizzleColumn(column)}`)
    .join(',\n');
  const constraints = [
    `pg.primaryKey({ columns: [${table.primaryKey.map((column) => `t.${column}`).join(',')}] })`,
  ];
  for (const columns of table.unique ?? [])
    constraints.push(`pg.unique().on(${columns.map((column) => `t.${column}`).join(',')})`);
  for (const index of table.indexes) {
    let statement = `pg.${index.unique ? 'uniqueIndex' : 'index'}(${JSON.stringify(index.name)})${index.method === 'gin' ? `.using('gin',${index.columns.map((column) => `t.${column}`).join(',')})` : `.on(${index.columns.map((column) => `t.${column}`).join(',')})`}`;
    if (index.where)
      statement += `.where(sql\`${identifier(index.where.column)}=${literal(index.where.equals)}\`)`;
    constraints.push(statement);
  }
  for (const key of table.foreignKeys) {
    const target = plan.tables.some((candidate) => candidate.name === key.targetTable)
      ? `table_${key.targetTable}`
      : `ref_${key.targetTable}`;
    constraints.push(
      `pg.foreignKey({name:${JSON.stringify(key.name)},columns:[${key.columns.map((column) => `t.${column}`).join(',')}],foreignColumns:[${key.targetColumns.map((column) => `${target}.${column}`).join(',')}] }).onDelete(${JSON.stringify(key.onDelete)})`,
    );
  }
  return `export const table_${table.name} = pg.pgTable(${JSON.stringify(table.name)}, {\n${fields}\n}, (t) => [${constraints.join(',\n  ')}]);`;
}
function referenceTables(plan: PhysicalPlan): string {
  const references = new Map<string, Map<string, PhysicalColumn>>();
  for (const table of plan.tables)
    for (const key of table.foreignKeys) {
      if (plan.tables.some((candidate) => candidate.name === key.targetTable)) continue;
      const columns = references.get(key.targetTable) ?? new Map<string, PhysicalColumn>();
      key.targetColumns.forEach((column, index) => {
        const source = table.columns.find((item) => item.name === key.columns[index]);
        if (!source) throw new Error('Invalid foreign key');
        columns.set(column, { name: column, type: source.type });
      });
      references.set(key.targetTable, columns);
    }
  return [...references]
    .map(
      ([name, columns]) =>
        `const ref_${name}=pg.pgTable(${JSON.stringify(name)},{${[...columns.values()].map((column) => `${column.name}:${drizzleColumn(column)}`).join(',')}});`,
    )
    .join('\n');
}
export function renderDrizzle(plan: PhysicalPlan): string {
  validatePlan(plan);
  const needsSql = plan.tables.some(
    (table) =>
      table.columns.some(
        (column) =>
          (column.default !== undefined && column.default !== 'now()') ||
          column.generated !== undefined,
      ) || table.indexes.some((index) => index.where),
  );
  return `${needsSql ? "import {sql} from 'drizzle-orm';\n" : ''}import * as pg from 'drizzle-orm/pg-core';\n${referenceTables(plan)}\n${plan.tables.map((table) => drizzleTable(table, plan)).join('\n\n')}\n`;
}
