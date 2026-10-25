import { createDatabase } from '@new-cms/database/client';
import { grantRuntimePrivileges } from '@new-cms/database/privileges';
import { loadMigrationDatabaseConfig } from '../bootstrap/load-config.ts';

async function main(): Promise<void> {
  const roleName = process.env['CMS_DATABASE_RUNTIME_ROLE'];
  if (!roleName) throw new Error('An existing runtime role is required');
  const database = createDatabase({
    ...loadMigrationDatabaseConfig(),
    connectionTimeoutMs: 2000,
    lockTimeoutMs: 10000,
    statementTimeoutMs: 60000,
  });
  try {
    await grantRuntimePrivileges(database, { roleName });
    process.stdout.write('Runtime database privileges applied and verified.\n');
  } finally {
    await database.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Runtime privilege configuration failed; verify the existing role, database ownership, and grants.\n',
  );
  process.exitCode = 1;
});
