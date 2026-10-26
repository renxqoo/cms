import { randomUUID } from 'node:crypto';
import { createDatabase } from '@new-cms/database/client';
import { migrate } from '@new-cms/database/migrate';
import { createLibraryMigrationDirectory } from './library-migrations.ts';

export interface TestDatabaseOptions {
  connectionString?: string;
  lockTimeoutMs?: number;
  maxConnections?: number;
  migrationDirectory?: string;
  migrationScope?: 'full' | 'library';
}

export function testDatabaseConnectionString(): string {
  return process.env['CMS_TEST_DATABASE_URL'] ?? 'postgresql:///postgres?host=/tmp';
}

export async function createTestDatabase(options: TestDatabaseOptions = {}) {
  const connectionString = options.connectionString ?? testDatabaseConnectionString();
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
  let library: Awaited<ReturnType<typeof createLibraryMigrationDirectory>> | undefined;
  let closing: Promise<void> | undefined;
  function close() {
    closing ??= (async () => {
      try {
        await database.close();
      } finally {
        try {
          await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        } finally {
          try {
            await control.close();
          } finally {
            await library?.close();
          }
        }
      }
    })();
    return closing;
  }
  try {
    if (options.migrationScope === 'library')
      library = await createLibraryMigrationDirectory(options.migrationDirectory);
    const directory = library?.directory ?? options.migrationDirectory;
    await control.query(`CREATE SCHEMA ${schema}`);
    await migrate(database, directory === undefined ? {} : { directory });
  } catch (error) {
    await close();
    throw error;
  }
  return { database, schema, connectionString, close };
}
