import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import {
  comparePlans,
  identifier,
  planFingerprint,
  renderDrizzle,
  renderSql,
  validatePlan,
} from '../index.ts';
import type { PhysicalPlan } from '../../schema-plan.ts';
function plan(): PhysicalPlan {
  return {
    version: 1,
    tables: [
      {
        name: 'generated_values',
        columns: [
          { name: 'id', type: 'uuid' },
          { name: 'text_value', type: 'text', nullable: true },
          {
            name: 'search_vector',
            type: 'tsvector',
            generated: { kind: 'textSearch', column: 'text_value' },
          },
          { name: 'int_value', type: 'integer', default: '0' },
          { name: 'big_value', type: 'bigint', default: '1' },
          { name: 'number_value', type: 'double precision', nullable: true },
          { name: 'bool_value', type: 'boolean', default: 'false' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'json_value', type: 'jsonb', nullable: true },
          { name: 'admin_id', type: 'uuid', nullable: true },
        ],
        primaryKey: ['id'],
        unique: [['id', 'int_value']],
        indexes: [
          { name: 'generated_text_unique', columns: ['text_value'], unique: true },
          {
            name: 'generated_boolean_partial',
            columns: ['bool_value'],
            where: { column: 'bool_value', equals: true },
          },
          { name: 'generated_json_gin', columns: ['json_value'], method: 'gin' },
          { name: 'generated_search_gin', columns: ['search_vector'], method: 'gin' },
        ],
        foreignKeys: [
          {
            name: 'generated_admin_fk',
            columns: ['admin_id'],
            targetTable: 'admins',
            targetColumns: ['id'],
            onDelete: 'restrict',
          },
        ],
      },
    ],
  };
}
it('renders executable typed SQL and a typechecked Drizzle artifact with the same foreign keys', async () => {
  const kit = await createTestDatabase();
  const directory = await mkdtemp(join(process.cwd(), 'packages/database/src', '.codegen-'));
  try {
    const definition = plan();
    await kit.database.query(renderSql(definition));
    const file = join(directory, 'schema.ts');
    await writeFile(file, renderDrizzle(definition));
    const checked = spawnSync(process.execPath, ['check', file], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
    const verify = join(directory, 'verify.ts');
    await writeFile(
      verify,
      `import {table_generated_values} from './schema.ts';\nimport {getTableConfig} from 'drizzle-orm/pg-core';\nconst config=getTableConfig(table_generated_values);\nprocess.stdout.write(JSON.stringify({columns:config.columns.map((column) => column.name),foreignKeys:config.foreignKeys.map((key) => key.reference().foreignColumns.map((column) => column.name)),methods:config.indexes.map((index) => index.config.method)}));\n`,
    );
    const executed = spawnSync(process.execPath, [verify], { encoding: 'utf8' });
    expect(executed.status, executed.stdout + executed.stderr).toBe(0);
    const artifact: unknown = JSON.parse(executed.stdout);
    expect(artifact).toEqual({
      columns: definition.tables[0]?.columns.map((column) => column.name),
      foreignKeys: [['id']],
      methods: ['btree', 'btree', 'gin', 'gin'],
    });
    const row = await kit.database.query<{
      int_value: number;
      big_value: string;
      bool_value: boolean;
      created_at: Date;
    }>(
      "INSERT INTO generated_values(id,text_value) VALUES(gen_random_uuid(),'Value') RETURNING int_value,big_value,bool_value,created_at",
    );
    expect(row.rows[0]).toMatchObject({ int_value: 0, big_value: '1', bool_value: false });
    await expect(
      kit.database.query(
        'INSERT INTO generated_values(id,admin_id) VALUES(gen_random_uuid(),gen_random_uuid())',
      ),
    ).rejects.toMatchObject({ code: '23503' });
  } finally {
    await rm(directory, { recursive: true, force: true });
    await kit.close();
  }
});
it('generates compilable imports for a minimal artifact and validates identifiers', async () => {
  const definition: PhysicalPlan = {
    version: 1,
    tables: [
      {
        name: 'only_text',
        columns: [{ name: 'id', type: 'text' }],
        primaryKey: ['id'],
        indexes: [],
        foreignKeys: [],
      },
    ],
  };
  const directory = await mkdtemp(join(process.cwd(), 'packages/database/src', '.codegen-'));
  try {
    const file = join(directory, 'schema.ts');
    await writeFile(file, renderDrizzle(definition));
    const checked = spawnSync(process.execPath, ['check', file], { encoding: 'utf8' });
    expect(checked.status, checked.stdout + checked.stderr).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  expect(() => identifier('name;DROP TABLE admins')).toThrowError('Invalid physical identifier');
  expect(identifier('safe_name')).toBe('"safe_name"');
});
it('reports safe additions and destructive structural changes without guessing renames', () => {
  const before = plan();
  const [table] = before.tables;
  if (!table) throw new Error('Missing table');
  const after: PhysicalPlan = {
    version: 1,
    tables: [
      {
        ...table,
        columns: [
          ...table.columns
            .filter((column) => column.name !== 'text_value')
            .map((column) =>
              column.name === 'int_value' ? { ...column, type: 'text' as const } : column,
            ),
          { name: 'added', type: 'text', nullable: true },
          { name: 'required_added', type: 'text' },
        ],
      },
      { ...table, name: 'additional_table' },
    ],
  };
  expect(comparePlans(before, after)).toEqual([
    { kind: 'removeColumn', table: 'generated_values', column: 'text_value', destructive: true },
    { kind: 'changeType', table: 'generated_values', column: 'int_value', destructive: true },
    { kind: 'addColumn', table: 'generated_values', column: 'added', destructive: false },
    { kind: 'addColumn', table: 'generated_values', column: 'required_added', destructive: true },
    { kind: 'addTable', table: 'additional_table', destructive: false },
  ]);
  expect(comparePlans(before, { version: 1, tables: [] })).toEqual([
    { kind: 'removeTable', table: 'generated_values', destructive: true },
  ]);
  expect(planFingerprint(before)).not.toBe(planFingerprint({ version: 1, tables: [] }));
});
it('rejects duplicated tables/columns and references to absent columns', () => {
  const original = plan();
  const [table] = original.tables;
  if (!table) throw new Error('Missing table');
  expect(() => validatePlan({ version: 2, tables: [] })).toThrowError('Unsupported physical plan');
  expect(() => validatePlan({ ...original, tables: [table, table] })).toThrowError(
    'Duplicate physical table',
  );
  expect(() =>
    validatePlan({
      ...original,
      tables: [{ ...table, columns: [...table.columns, { name: 'id', type: 'uuid' }] }],
    }),
  ).toThrowError('Duplicate physical column');
  expect(() =>
    validatePlan({ ...original, tables: [{ ...table, primaryKey: ['absent'] }] }),
  ).toThrowError('Unknown physical column');
  expect(() =>
    validatePlan({
      ...original,
      tables: [
        {
          ...table,
          foreignKeys: [
            {
              name: 'bad',
              columns: ['id'],
              targetTable: 'admins',
              targetColumns: [],
              onDelete: 'restrict',
            },
          ],
        },
      ],
    }),
  ).toThrowError('Invalid physical foreign key');
  expect(() =>
    validatePlan({
      ...original,
      tables: [
        {
          ...table,
          foreignKeys: [
            {
              name: 'bad',
              columns: ['absent'],
              targetTable: 'admins',
              targetColumns: ['id'],
              onDelete: 'restrict',
            },
          ],
        },
      ],
    }),
  ).toThrowError('Unknown physical foreign key column');
});
