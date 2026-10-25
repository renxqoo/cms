import { expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { renderSql, renderEvolutionSql, parsePhysicalPlan, comparePlans } from '../index.ts';
import type { PhysicalPlan, PhysicalTable } from '../../schema-plan.ts';
function table(): PhysicalTable {
  return {
    name: 'evolved_records',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'name', type: 'text' },
      { name: 'counter', type: 'integer', default: '0' },
      { name: 'owner_id', type: 'uuid', nullable: true },
    ],
    primaryKey: ['id'],
    indexes: [],
    foreignKeys: [],
  };
}
function plan(value: PhysicalTable = table()): PhysicalPlan {
  return { version: 1, tables: [value] };
}
it('incremental DDL changes existing tables without recreating them and enforces new indexes, uniqueness and foreign keys', async () => {
  const kit = await createTestDatabase();
  try {
    const before = plan();
    await kit.database.query(renderSql(before));
    await kit.database.query(
      "INSERT INTO evolved_records(id,name) VALUES(gen_random_uuid(),'kept')",
    );
    const base = table();
    const next = plan({
      ...base,
      columns: [
        ...base.columns.map((column) => {
          if (column.name === 'name') return { ...column, nullable: true };
          if (column.name === 'counter') return { ...column, default: '1' as const };
          return column;
        }),
        { name: 'description', type: 'text', nullable: true },
      ],
      unique: [['name']],
      indexes: [{ name: 'evolved_name_idx', columns: ['name'] }],
      foreignKeys: [
        {
          name: 'evolved_owner_fk',
          columns: ['owner_id'],
          targetTable: 'admins',
          targetColumns: ['id'],
          onDelete: 'restrict',
          deferrable: true,
        },
      ],
    });
    const evolution = renderEvolutionSql({ previous: before, next });
    expect(evolution.manualReasons).toEqual([]);
    expect(evolution.sql).not.toContain('CREATE TABLE');
    await kit.database.query(evolution.sql);
    const old = await kit.database.query<{ name: string; counter: number }>(
      'SELECT name,counter FROM evolved_records',
    );
    expect(old.rows).toEqual([{ name: 'kept', counter: 0 }]);
    const inserted = await kit.database.query<{ counter: number; description: null }>(
      'INSERT INTO evolved_records(id,name) VALUES(gen_random_uuid(),NULL) RETURNING counter,description',
    );
    expect(inserted.rows).toEqual([{ counter: 1, description: null }]);
    await expect(
      kit.database.query("INSERT INTO evolved_records(id,name) VALUES(gen_random_uuid(),'kept')"),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      kit.database.query(
        'INSERT INTO evolved_records(id,owner_id) VALUES(gen_random_uuid(),gen_random_uuid())',
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const indexes = await kit.database.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename='evolved_records'",
    );
    expect(indexes.rows.map((row) => row.indexname)).toContain('evolved_name_idx');
  } finally {
    await kit.close();
  }
});
it('reports destructive constraint, index, primary-key and column changes without emitting their DDL', () => {
  const before = plan({
    ...table(),
    unique: [['name']],
    indexes: [
      { name: 'by_name', columns: ['name'] },
      { name: 'by_count', columns: ['counter'] },
    ],
    foreignKeys: [
      {
        name: 'owner_fk',
        columns: ['owner_id'],
        targetTable: 'admins',
        targetColumns: ['id'],
        onDelete: 'restrict',
      },
      {
        name: 'old_fk',
        columns: ['owner_id'],
        targetTable: 'admins',
        targetColumns: ['id'],
        onDelete: 'restrict',
      },
    ],
  });
  const next = plan({
    ...table(),
    primaryKey: ['id', 'name'],
    columns: table().columns.map((column) =>
      column.name === 'owner_id' ? { ...column, nullable: false } : column,
    ),
    indexes: [{ name: 'by_name', columns: ['name'], unique: true }],
    foreignKeys: [
      {
        name: 'owner_fk',
        columns: ['owner_id'],
        targetTable: 'admins',
        targetColumns: ['id'],
        onDelete: 'cascade',
      },
    ],
  });
  const evolution = renderEvolutionSql({ previous: before, next });
  expect(evolution.changes.map((change) => change.kind)).toEqual(
    expect.arrayContaining([
      'changeColumn',
      'removeIndex',
      'changeIndex',
      'removeForeignKey',
      'changeForeignKey',
      'removeUnique',
      'changePrimaryKey',
    ]),
  );
  expect(evolution.changes.every((change) => change.destructive)).toBe(true);
  expect(evolution.sql.trim()).toBe('');
  expect(evolution.manualReasons).toHaveLength(evolution.changes.length);
  expect(comparePlans(before, before)).toEqual([]);
});
it('parses reviewed plans strictly and rejects malformed defaults, predicates, generated columns and foreign-key structure', () => {
  const good = plan({
    ...table(),
    indexes: [
      {
        name: 'filtered',
        columns: ['name'],
        where: { column: 'name', equals: 'visible' },
        method: 'btree',
      },
    ],
  });
  expect(parsePhysicalPlan(JSON.parse(JSON.stringify(good)))).toEqual(good);
  const malformed: unknown[] = [
    null,
    [],
    { ...good, extra: 1 },
    { version: 1, tables: [{ ...table(), extra: 1 }] },
  ];
  for (const columns of [
    [{ name: 'id', type: 'bad' }],
    [{ name: 'id', type: 'uuid', default: { sql: 'unsafe' } }],
    [{ name: 'id', type: 'uuid', nullable: 'yes' }],
    [{ name: 'id', type: 'uuid', generated: { kind: 'unknown', column: 'id' } }],
  ])
    malformed.push({ version: 1, tables: [{ ...table(), columns }] });
  for (const index of [
    { name: 'bad', columns: ['name'], method: 'hash' },
    { name: 'bad', columns: ['name'], unique: 1 },
    { name: 'bad', columns: ['name'], where: { column: 'name', equals: null } },
    { name: 'bad', columns: ['name'], where: { column: 'name', equals: NaN } },
    { name: 'bad', columns: ['name'], where: { column: 'name', equals: true, extra: 1 } },
  ])
    malformed.push({ version: 1, tables: [{ ...table(), indexes: [index] }] });
  malformed.push(
    {
      version: 1,
      tables: [
        {
          ...table(),
          foreignKeys: [
            {
              name: 'bad',
              columns: ['owner_id'],
              targetTable: 'admins',
              targetColumns: [],
              onDelete: 'restrict',
            },
          ],
        },
      ],
    },
    {
      version: 1,
      tables: [
        {
          ...table(),
          foreignKeys: [
            {
              name: 'bad',
              columns: ['owner_id'],
              targetTable: 'admins',
              targetColumns: ['id'],
              onDelete: 'set null',
            },
          ],
        },
      ],
    },
    { version: 1, tables: [{ ...table(), unique: [['missing']] }] },
  );
  for (const value of malformed)
    expect(() => parsePhysicalPlan(value)).toThrowError(/Invalid|Unknown/);
  const partials = [
    { column: 'counter', equals: 1 },
    { column: 'counter', equals: true },
  ];
  for (const where of partials)
    expect(
      parsePhysicalPlan(
        plan({ ...table(), indexes: [{ name: 'filtered', columns: ['counter'], where }] }),
      ),
    ).toBeDefined();
});
