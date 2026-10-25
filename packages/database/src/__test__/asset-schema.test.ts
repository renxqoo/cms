import { afterEach, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as assetSchema from '../schema/assets.ts';
import { createTestDatabase } from '../../../../test/support/database.ts';

const stores: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

it('keeps every asset owner column and foreign-key mapping consistent with the independent SQL migration', async () => {
  const store = await createTestDatabase();
  stores.push(store);
  for (const table of Object.values(assetSchema)) {
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
        type: column
          .getSQLType()
          .replace('varchar', 'character varying')
          .replace('char(', 'character('),
        not_null: column.notNull,
      })),
    );
    const keys = await store.database.query<{ count: string }>(
      "SELECT count(*) AS count FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f'",
      [config.name],
    );
    expect(Number(keys.rows[0]?.count)).toBe(config.foreignKeys.length);
  }
});
