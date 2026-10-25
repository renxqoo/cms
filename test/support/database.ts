import { randomUUID } from 'node:crypto';
import { createDatabase } from '@new-cms/database/client';
import { migrate } from '@new-cms/database/migrate';

export interface TestDatabaseOptions {
  connectionString?: string;
  lockTimeoutMs?: number;
  maxConnections?: number;
}

export async function createTestDatabase(options: TestDatabaseOptions = {}) {
  const connectionString =
    options.connectionString ??
    process.env['CMS_TEST_DATABASE_URL'] ??
    'postgresql:///postgres?host=/tmp';
  const schema = `cms_test_${randomUUID().replaceAll('-', '')}`;
  const control = createDatabase({ connectionString, maxConnections: 2 });
  const database = createDatabase({
    connectionString,
    schema,
    maxConnections: options.maxConnections ?? 8,
    lockTimeoutMs: options.lockTimeoutMs ?? 2000,
    statementTimeoutMs: 5000,
    connectionTimeoutMs: 2000,
  });
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    await migrate(database);
  } catch (error) {
    await database.close();
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.close();
    throw error;
  }
  return {
    database,
    schema,
    connectionString,
    close: async () => {
      await database.close();
      await control.query(`DROP SCHEMA ${schema} CASCADE`);
      await control.close();
    },
  };
}
