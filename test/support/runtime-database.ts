import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabase } from '@new-cms/database/client';
import type { Database } from '@new-cms/database/client';
import { createTestDatabase, testDatabaseConnectionString } from './database.ts';

interface RuntimeResources {
  control: Database;
  databaseName: string;
  databaseCreated: boolean;
  roleName: string;
  roleCreated: boolean;
  fixture?: Awaited<ReturnType<typeof createTestDatabase>>;
  runtime?: Database;
}

function databaseConnectionString(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  url.searchParams.delete('database');
  url.searchParams.delete('dbname');
  return url.toString();
}

function roleConnectionString(connectionString: string, roleName: string, password: string) {
  const url = new URL(connectionString);
  if (!url.hostname) url.hostname = 'localhost';
  url.username = roleName;
  url.password = password;
  url.searchParams.delete('user');
  url.searchParams.delete('password');
  return url.toString();
}

async function closeResources(resources: RuntimeResources): Promise<void> {
  const { control, databaseName, databaseCreated, roleName, fixture, runtime, roleCreated } =
    resources;
  const steps = [
    () => runtime?.close(),
    () => roleCreated && fixture?.database.query(`DROP OWNED BY ${roleName}`),
    () => fixture?.close(),
    () => roleCreated && control.query(`DROP ROLE IF EXISTS ${roleName}`),
    () => databaseCreated && control.query(`DROP DATABASE IF EXISTS ${databaseName}`),
    () => roleCreated && control.query(`DROP ROLE IF EXISTS ${roleName}`),
    () => control.close(),
  ];
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Runtime fixture cleanup failed');
}

export async function createTestRuntimeDatabase() {
  const connectionString = testDatabaseConnectionString();
  const databaseName = `cms_test_db_${randomUUID().replaceAll('-', '')}`;
  const resources: RuntimeResources = {
    control: createDatabase({ connectionString, maxConnections: 2 }),
    databaseName,
    databaseCreated: false,
    roleName: `cms_runtime_${randomUUID().replaceAll('-', '')}`,
    roleCreated: false,
  };
  try {
    await resources.control.query(`CREATE DATABASE ${databaseName} TEMPLATE template0`);
    resources.databaseCreated = true;
    const fixture = await createTestDatabase({
      connectionString: databaseConnectionString(connectionString, databaseName),
    });
    resources.fixture = fixture;
    const password = randomBytes(32).toString('hex');
    await fixture.database.query(
      `CREATE ROLE ${resources.roleName} LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB
       NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    );
    resources.roleCreated = true;
    const runtimeConnection = roleConnectionString(
      fixture.connectionString,
      resources.roleName,
      password,
    );
    const runtime = createDatabase({
      connectionString: runtimeConnection,
      schema: fixture.schema,
      maxConnections: 2,
    });
    resources.runtime = runtime;
    return {
      ...fixture,
      roleName: resources.roleName,
      runtime,
      runtimeConnectionString: runtimeConnection,
      close: () => closeResources(resources),
    };
  } catch (error) {
    await closeResources(resources);
    throw error;
  }
}
