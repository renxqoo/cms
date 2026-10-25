import { createDatabase } from '@new-cms/database/client';
import { migrate } from '@new-cms/database/migrate';
import { loadDatabaseConfig } from '../bootstrap/load-config.ts';

async function main(): Promise<void> {
  const database = createDatabase({
    ...loadDatabaseConfig(),
    connectionTimeoutMs: 2000,
    lockTimeoutMs: 10000,
    statementTimeoutMs: 60000,
  });
  try {
    await migrate(database);
    process.stdout.write('Database migrations applied.\n');
  } finally {
    await database.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Migration failed; verify database configuration and migration compatibility.\n',
  );
  process.exitCode = 1;
});
