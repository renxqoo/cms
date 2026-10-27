import { expect, it } from 'vitest';
import { createDatabase } from '@new-cms/database/client';
import { grantRuntimePrivileges } from '@new-cms/database/privileges';
import { createTestRuntimeDatabase } from '../../../../../test/support/runtime-database.ts';
import { testDatabaseConnectionString } from '../../../../../test/support/database.ts';
import { contentConfiguration } from '../../bootstrap/create-content.ts';
import { applicationRuntimeProfile } from '../runtime-privileges.ts';

it('cleans up a fully granted Collections runtime without exhausting PostgreSQL shared lock memory', async () => {
  const kit = await createTestRuntimeDatabase();
  const current = await kit.database.query<{ name: string }>('SELECT current_database() AS name');
  const [database] = current.rows;
  if (!database) throw new Error('Missing isolated database');
  try {
    await grantRuntimePrivileges(kit.database, {
      roleName: kit.roleName,
      profile: applicationRuntimeProfile(contentConfiguration().mapping),
    });
  } finally {
    await kit.close();
  }
  const control = createDatabase({ connectionString: testDatabaseConnectionString() });
  try {
    expect(
      (await control.query('SELECT 1 FROM pg_database WHERE datname=$1', [database.name])).rowCount,
    ).toBe(0);
    expect(
      (await control.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [kit.roleName])).rowCount,
    ).toBe(0);
  } finally {
    await control.close();
  }
});
