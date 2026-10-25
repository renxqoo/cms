import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { afterEach, expect, it } from 'vitest';
import * as generated from '../schema/generated/content.ts';
import * as workSchema from '../schema/content-work.ts';
import { createTestDatabase } from '../../../../test/support/database.ts';

const stores: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});
it('matches generated and work Drizzle tables to migrated PostgreSQL columns, indexes and reference targets', async () => {
  const store = await createTestDatabase();
  stores.push(store);
  const tables = [...Object.values(generated), ...Object.values(workSchema)].filter((value) =>
    is(value, PgTable),
  );
  expect(tables.length).toBeGreaterThan(0);
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = await store.database.query<{ name: string; type: string; not_null: boolean }>(
      `SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
       FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname=current_schema() AND t.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [config.name],
    );
    expect(columns.rows).toEqual(
      config.columns.map((column) => ({
        name: column.name,
        type: column.getSQLType(),
        not_null: column.notNull,
      })),
    );
    const indexes = await store.database.query<{ name: string }>(
      'SELECT indexname AS name FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1',
      [config.name],
    );
    for (const index of config.indexes)
      expect(indexes.rows).toContainEqual({ name: index.config.name });
    const references = await store.database.query<{
      name: string;
      source: string[];
      target: string;
      columns: string[];
    }>(
      `SELECT c.conname AS name,t.relname AS target,
       ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(attnum,pos) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.pos)::text[] AS source,
       ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(attnum,pos) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.pos)::text[] AS columns
       FROM pg_constraint c JOIN pg_class t ON t.oid=c.confrelid WHERE c.conrelid=$1::regclass AND c.contype='f' ORDER BY c.conname`,
      [config.name],
    );
    const actual = references.rows.map(({ name: _name, ...reference }) => reference);
    const expected = config.foreignKeys.map((key) => {
      const reference = key.reference();
      return {
        source: reference.columns.map((column) => column.name),
        target: getTableConfig(reference.foreignTable).name,
        columns: reference.foreignColumns.map((column) => column.name),
      };
    });
    expect(actual.toSorted(compareReferences)).toEqual(expected.toSorted(compareReferences));
  }
});

function compareReferences(
  a: { source: string[]; target: string; columns: string[] },
  b: { source: string[]; target: string; columns: string[] },
): number {
  const key = (value: typeof a) =>
    `${value.source.join(',')}>${value.target}:${value.columns.join(',')}`;
  return key(a).localeCompare(key(b));
}
