import { createDatabase } from '@new-cms/database/client';

export async function withTestDatabaseDdl<T>(
  connectionString: string,
  work: () => Promise<T>,
): Promise<T> {
  const control = createDatabase({
    connectionString,
    maxConnections: 1,
    lockTimeoutMs: 30000,
    statementTimeoutMs: 30000,
  });
  try {
    return await control.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('cms-test-fixture-ddl',0))");
      return work();
    });
  } finally {
    await control.close();
  }
}
