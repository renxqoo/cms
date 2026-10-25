import type {
  PhysicalColumn,
  PhysicalForeignKey,
  PhysicalIndex,
  PhysicalPlan,
  PhysicalTable,
} from '../schema-plan.ts';
import { identifier, columnSql, foreignSql, indexSql, renderSql, validatePlan } from './render.ts';
export interface PlanChange {
  kind:
    | 'addTable'
    | 'removeTable'
    | 'addColumn'
    | 'removeColumn'
    | 'changeType'
    | 'changeColumn'
    | 'addIndex'
    | 'removeIndex'
    | 'changeIndex'
    | 'addForeignKey'
    | 'removeForeignKey'
    | 'changeForeignKey'
    | 'addUnique'
    | 'removeUnique'
    | 'changePrimaryKey';
  table: string;
  column?: string;
  name?: string;
  columns?: readonly string[];
  destructive: boolean;
}
function columnChanges(table: PhysicalTable, next: PhysicalTable): PlanChange[] {
  const changes: PlanChange[] = [];
  const columns = new Map(next.columns.map((column) => [column.name, column]));
  for (const previous of table.columns) {
    const replacement = columns.get(previous.name);
    if (!replacement)
      changes.push({
        kind: 'removeColumn',
        table: table.name,
        column: previous.name,
        destructive: true,
      });
    else if (previous.type !== replacement.type)
      changes.push({
        kind: 'changeType',
        table: table.name,
        column: previous.name,
        destructive: true,
      });
    else if (JSON.stringify(previous) !== JSON.stringify(replacement))
      changes.push({
        kind: 'changeColumn',
        table: table.name,
        column: previous.name,
        destructive:
          (previous.nullable === true && replacement.nullable !== true) ||
          JSON.stringify(previous.generated) !== JSON.stringify(replacement.generated),
      });
  }
  for (const column of next.columns)
    if (!table.columns.some((previous) => previous.name === column.name))
      changes.push({
        kind: 'addColumn',
        table: table.name,
        column: column.name,
        destructive: !column.nullable && !column.default && !column.generated,
      });
  return changes;
}
function namedChanges<T extends { name: string }>(input: {
  table: string;
  previous: readonly T[];
  next: readonly T[];
  kind: 'Index' | 'ForeignKey';
}): PlanChange[] {
  const changes: PlanChange[] = [];
  for (const previous of input.previous) {
    const replacement = input.next.find((item) => item.name === previous.name);
    if (!replacement)
      changes.push({
        kind: input.kind === 'Index' ? 'removeIndex' : 'removeForeignKey',
        table: input.table,
        name: previous.name,
        destructive: true,
      });
    else if (JSON.stringify(previous) !== JSON.stringify(replacement))
      changes.push({
        kind: input.kind === 'Index' ? 'changeIndex' : 'changeForeignKey',
        table: input.table,
        name: previous.name,
        destructive: true,
      });
  }
  for (const item of input.next)
    if (!input.previous.some((previous) => previous.name === item.name))
      changes.push({
        kind: input.kind === 'Index' ? 'addIndex' : 'addForeignKey',
        table: input.table,
        name: item.name,
        destructive: false,
      });
  return changes;
}
function keyChanges(previous: PhysicalTable, next: PhysicalTable): PlanChange[] {
  const changes: PlanChange[] = [];
  if (JSON.stringify(previous.primaryKey) !== JSON.stringify(next.primaryKey))
    changes.push({ kind: 'changePrimaryKey', table: previous.name, destructive: true });
  for (const columns of previous.unique ?? [])
    if (!(next.unique ?? []).some((item) => JSON.stringify(item) === JSON.stringify(columns)))
      changes.push({ kind: 'removeUnique', table: previous.name, columns, destructive: true });
  for (const columns of next.unique ?? [])
    if (!(previous.unique ?? []).some((item) => JSON.stringify(item) === JSON.stringify(columns)))
      changes.push({ kind: 'addUnique', table: previous.name, columns, destructive: false });
  return changes;
}
export function comparePlans(previous: PhysicalPlan, next: PhysicalPlan): PlanChange[] {
  const changes: PlanChange[] = [];
  for (const table of previous.tables) {
    const replacement = next.tables.find((item) => item.name === table.name);
    if (!replacement) {
      changes.push({ kind: 'removeTable', table: table.name, destructive: true });
      continue;
    }
    changes.push(
      ...columnChanges(table, replacement),
      ...namedChanges<PhysicalIndex>({
        table: table.name,
        previous: table.indexes,
        next: replacement.indexes,
        kind: 'Index',
      }),
      ...namedChanges<PhysicalForeignKey>({
        table: table.name,
        previous: table.foreignKeys,
        next: replacement.foreignKeys,
        kind: 'ForeignKey',
      }),
      ...keyChanges(table, replacement),
    );
  }
  for (const table of next.tables)
    if (!previous.tables.some((item) => item.name === table.name))
      changes.push({ kind: 'addTable', table: table.name, destructive: false });
  return changes;
}
function changeColumn(previous: PhysicalColumn, next: PhysicalColumn, table: string): string[] {
  const statements: string[] = [];
  const target = `ALTER TABLE ${identifier(table)} ALTER COLUMN ${identifier(next.name)}`;
  if (previous.nullable !== next.nullable && next.nullable)
    statements.push(`${target} DROP NOT NULL;`);
  if (previous.default !== next.default)
    statements.push(
      next.default ? `${target} SET DEFAULT ${next.default};` : `${target} DROP DEFAULT;`,
    );
  return statements;
}
function safeChangeSql(change: PlanChange, previous: PhysicalPlan, next: PhysicalPlan): string[] {
  const table = next.tables.find((item) => item.name === change.table);
  if (!table) return [];
  if (change.kind === 'addIndex') {
    const index = table.indexes.find((item) => item.name === change.name);
    return index ? [indexSql(table, index)] : [];
  }
  if (change.kind === 'addForeignKey') {
    const key = table.foreignKeys.find((item) => item.name === change.name);
    return key ? [`ALTER TABLE ${identifier(table.name)} ADD ${foreignSql(key)};`] : [];
  }
  if (change.kind === 'addUnique')
    return [
      `ALTER TABLE ${identifier(table.name)} ADD UNIQUE (${(change.columns ?? []).map(identifier).join(',')});`,
    ];
  const column = table.columns.find((item) => item.name === change.column);
  if (!column) return [];
  if (change.kind === 'addColumn')
    return [`ALTER TABLE ${identifier(table.name)} ADD COLUMN ${columnSql(column)};`];
  if (change.kind === 'changeColumn') {
    const before = previous.tables
      .find((item) => item.name === table.name)
      ?.columns.find((item) => item.name === column.name);
    return before ? changeColumn(before, column, table.name) : [];
  }
  return [];
}
export function renderEvolutionSql(input: { previous: PhysicalPlan; next: PhysicalPlan }): {
  changes: PlanChange[];
  sql: string;
  manualReasons: string[];
} {
  validatePlan(input.previous);
  validatePlan(input.next);
  const changes = comparePlans(input.previous, input.next);
  const manualReasons = changes
    .filter((change) => change.destructive)
    .map((change) => `${change.kind}:${change.table}:${change.column ?? change.name ?? ''}`);
  const added = changes
    .filter((change) => change.kind === 'addTable')
    .map((change) => input.next.tables.find((table) => table.name === change.table))
    .filter((table): table is PhysicalTable => table !== undefined);
  const statements = changes
    .filter((change) => !change.destructive && change.kind !== 'addTable')
    .flatMap((change) => safeChangeSql(change, input.previous, input.next));
  return {
    changes,
    manualReasons,
    sql: `${added.length > 0 ? renderSql({ version: 1, tables: added }) : ''}${statements.join('\n')}${statements.length > 0 ? '\n' : ''}`,
  };
}
