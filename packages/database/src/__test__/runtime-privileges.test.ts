import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../client.ts';
import { assertRuntimePrivileges, grantRuntimePrivileges } from '../privileges.ts';
import { createTestRuntimeDatabase } from '../../../../test/support/runtime-database.ts';

const fixtures: Awaited<ReturnType<typeof createTestRuntimeDatabase>>[] = [];
async function fixture() {
  const result = await createTestRuntimeDatabase();
  fixtures.push(result);
  await result.database.query(`GRANT ALL ON SCHEMA ${result.schema} TO ${result.roleName}`);
  await result.database.query(
    `GRANT ALL ON ALL TABLES IN SCHEMA ${result.schema} TO ${result.roleName}`,
  );
  await grantRuntimePrivileges(result.database, { roleName: result.roleName });
  await assertRuntimePrivileges(result.runtime);
  return result;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((item) => item.close()));
});

describe('dedicated runtime PostgreSQL role', () => {
  it('does not allow runtime DDL or disabling audit protection', async () => {
    const { runtime } = await fixture();
    await expect(runtime.query('CREATE TABLE runtime_escape(id int)')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      runtime.query('ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('has only INSERT and SELECT audit privileges, without mutating or granting them', async () => {
    const { runtime } = await fixture();
    const privilege = await runtime.query<{ extra: boolean }>(
      `SELECT has_table_privilege(current_user,'audit_events','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       OR has_table_privilege(current_user,'audit_events','INSERT WITH GRANT OPTION,SELECT WITH GRANT OPTION') AS extra`,
    );
    expect(privilege.rows[0]?.extra).toBe(false);
    const id = randomUUID();
    await runtime.query(
      `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
       VALUES($1,'system','test.runtime','test','runtime-privileges','{}')`,
      [id],
    );
    expect((await runtime.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount).toBe(1);
    await expect(runtime.query('TRUNCATE audit_events')).rejects.toMatchObject({ code: '42501' });
  });
});

it('keeps a safe login role independent from every database owner and allows ordinary business CRUD', async () => {
  const { runtime, database } = await fixture();
  const attributes = await runtime.query<{
    rolsuper: boolean;
    rolcreaterole: boolean;
    rolcreatedb: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    members: string;
  }>(`SELECT rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,
       (SELECT count(*) FROM pg_roles p WHERE p.oid<>r.oid AND pg_has_role(r.oid,p.oid,'MEMBER'))::text AS members
      FROM pg_roles r WHERE rolname=current_user`);
  expect(attributes.rows[0]).toEqual({
    rolsuper: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
    members: '0',
  });
  const id = randomUUID();
  await runtime.query("INSERT INTO roles(id,code,name) VALUES($1,'runtime_editor','Editor')", [id]);
  await runtime.query("UPDATE roles SET name='Updated' WHERE id=$1", [id]);
  expect((await database.query('SELECT name FROM roles WHERE id=$1', [id])).rows[0]?.['name']).toBe(
    'Updated',
  );
  await runtime.query('DELETE FROM roles WHERE id=$1', [id]);
  expect((await runtime.query('SELECT id FROM roles WHERE id=$1', [id])).rowCount).toBe(0);
});

it.each([
  'UPDATE audit_events SET detail=detail',
  'DELETE FROM audit_events',
  'TRUNCATE audit_events',
])('retains persistent audit records when runtime attempts %s', async (statement) => {
  const { runtime } = await fixture();
  const id = randomUUID();
  await runtime.query(
    `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
       VALUES($1,'system','test.runtime','test','runtime-denial','{}')`,
    [id],
  );
  await expect(runtime.query(statement)).rejects.toMatchObject({ code: '42501' });
  expect((await runtime.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount).toBe(1);
});

it.each([
  'CREATE SCHEMA runtime_escape',
  'ALTER TABLE audit_events ADD COLUMN escaped text',
  'DROP TABLE audit_events',
  'DROP TRIGGER audit_events_append_only ON audit_events',
  "CREATE FUNCTION runtime_escape() RETURNS int LANGUAGE sql AS 'SELECT 1'",
  'ALTER FUNCTION cms_protect_audit_events() RENAME TO escaped_protection',
  'TRUNCATE roles CASCADE',
  'UPDATE operation_catalog SET module=module',
  'DELETE FROM cms_migrations',
])('denies runtime persistent DDL and release metadata writes: %s', async (statement) => {
  const { runtime } = await fixture();
  await expect(runtime.query(statement)).rejects.toMatchObject({ code: '42501' });
});

it.each(['SUPERUSER', 'CREATEROLE', 'CREATEDB', 'REPLICATION', 'BYPASSRLS', 'NOLOGIN'])(
  'rejects an existing runtime role with unsafe %s attributes',
  async (attribute) => {
    const { runtime, database, roleName } = await fixture();
    await database.query(`ALTER ROLE ${roleName} ${attribute}`);
    await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
      'Runtime role attributes or ownership are unsafe',
    );
    await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
      'Runtime role attributes or ownership are unsafe',
    );
  },
);

it('rejects the migration owner and owner membership even without inheritance', async () => {
  const { runtime, database, roleName } = await fixture();
  await expect(assertRuntimePrivileges(database)).rejects.toThrow(
    'Runtime role attributes or ownership are unsafe',
  );
  const owner = await database.query<{ name: string }>('SELECT current_user AS name');
  const ownerName = owner.rows[0]?.name;
  if (!ownerName) throw new Error('Missing migration owner');
  await database.query(
    `GRANT "${ownerName.replaceAll('"', '""')}" TO ${roleName} WITH INHERIT FALSE`,
  );
  await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
    'Runtime role attributes or ownership are unsafe',
  );
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime role attributes or ownership are unsafe',
  );
});

it('rejects application table ownership even after ordinary grants are revoked', async () => {
  const { runtime, database, roleName } = await fixture();
  await database.query(`ALTER TABLE audit_events OWNER TO ${roleName}`);
  await database.query(`REVOKE ALL ON audit_events FROM ${roleName}`);
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime role attributes or ownership are unsafe',
  );
  await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
    'Runtime role attributes or ownership are unsafe',
  );
});

it('rejects SET ROLE sessions instead of trusting a privileged login switched to runtime', async () => {
  const { database, roleName } = await fixture();
  await database.transaction(async (tx) => {
    await tx.query(`SET LOCAL ROLE ${roleName}`);
    await expect(assertRuntimePrivileges(tx)).rejects.toThrow(
      'Runtime database must use its dedicated login role',
    );
  });
});

it('rejects PUBLIC audit mutation privileges and rolls back partial grant changes', async () => {
  const { runtime, database, roleName, schema } = await fixture();
  await database.query(`GRANT UPDATE ON audit_events TO PUBLIC`);
  await database.query(`GRANT CREATE ON SCHEMA ${schema} TO ${roleName}`);
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
  await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
    'Runtime table privileges are unsafe or incomplete',
  );
  expect(
    (
      await database.query<{ allowed: boolean }>(
        "SELECT has_schema_privilege($1,$2,'CREATE') AS allowed",
        [roleName, schema],
      )
    ).rows[0]?.allowed,
  ).toBe(true);
});

it('detects column-only audit mutation grants and repairs direct column permissions', async () => {
  const { runtime, database, roleName } = await fixture();
  await database.query(`GRANT UPDATE(detail) ON audit_events TO ${roleName}`);
  expect(
    (
      await runtime.query<{ allowed: boolean }>(
        "SELECT has_table_privilege(current_user,'audit_events','UPDATE') AS allowed",
      )
    ).rows[0]?.allowed,
  ).toBe(false);
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime table privileges are unsafe or incomplete',
  );
  await grantRuntimePrivileges(database, { roleName });
  await assertRuntimePrivileges(runtime);
  expect(
    (
      await runtime.query<{ allowed: boolean }>(
        "SELECT has_any_column_privilege(current_user,'audit_events','UPDATE') AS allowed",
      )
    ).rows[0]?.allowed,
  ).toBe(false);
});

it('rejects missing, malformed, or unprovisioned runtime roles', async () => {
  const result = await createTestRuntimeDatabase();
  fixtures.push(result);
  await expect(assertRuntimePrivileges(result.runtime)).rejects.toThrow(
    /Runtime .*schema .*unsafe|Runtime database schema is unavailable/,
  );
  await expect(
    grantRuntimePrivileges(result.database, { roleName: 'x;DROP ROLE x' }),
  ).rejects.toThrow('Invalid runtime role name');
  await expect(
    grantRuntimePrivileges(result.database, {
      roleName: `cms_missing_${randomUUID().replaceAll('-', '')}`,
    }),
  ).rejects.toThrow('Runtime role attributes or ownership are unsafe');
});

it('rejects persistent schema CREATE inherited from PUBLIC without mutating shared PUBLIC grants', async () => {
  const { runtime, database, roleName, schema } = await fixture();
  await database.query(`GRANT CREATE ON SCHEMA ${schema} TO PUBLIC`);
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
  await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
  expect(
    (
      await database.query<{ allowed: boolean }>(
        "SELECT has_schema_privilege('public',$1,'CREATE') AS allowed",
        [schema],
      )
    ).rows[0]?.allowed,
  ).toBe(true);
});

it('rejects executable SECURITY DEFINER routines and unsupported additional tables', async () => {
  const { runtime, database, roleName } = await fixture();
  await database.query(
    "CREATE FUNCTION escape_runtime() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'",
  );
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
  await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
  await database.query('DROP FUNCTION escape_runtime()');
  await database.query('CREATE TABLE unexpected_runtime_table(id int)');
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime database tables differ from the supported schema',
  );
});

it('rejects column grant options even when the table privileges are otherwise minimal', async () => {
  const { runtime, database, roleName } = await fixture();
  await database.query(`GRANT SELECT(detail) ON audit_events TO ${roleName} WITH GRANT OPTION`);
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime table privileges are unsafe or incomplete',
  );
  await grantRuntimePrivileges(database, { roleName });
  await assertRuntimePrivileges(runtime);
});

it('rejects persistent DDL rights on another existing schema while preserving PUBLIC TEMP', async () => {
  const { runtime, database, roleName, schema } = await fixture();
  const otherSchema = `${schema}_other`;
  try {
    await database.query(`CREATE SCHEMA ${otherSchema}`);
    await database.query(`GRANT USAGE,CREATE ON SCHEMA ${otherSchema} TO ${roleName}`);
    await runtime.query(`CREATE TABLE ${otherSchema}.runtime_escape(id int)`);
    await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
    await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
  } finally {
    await database.query(`DROP SCHEMA IF EXISTS ${otherSchema} CASCADE`);
  }
});

it.each([
  `DROP TRIGGER audit_events_append_only ON audit_events;
   CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
   FOR EACH STATEMENT EXECUTE FUNCTION cms_protect_audit_events()`,
  'ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only',
  'ALTER TABLE audit_events ENABLE REPLICA TRIGGER audit_events_append_only',
])(
  'rejects an old or disabled append-only audit guard before startup or grant: %s',
  async (statement) => {
    const { runtime, database, roleName } = await fixture();
    await database.query(statement);
    await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
      'Audit append-only protection is unavailable',
    );
    await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
      'Audit append-only protection is unavailable',
    );
  },
);

it('rejects callable SECURITY DEFINER audit erasure in another schema', async () => {
  const { runtime, database, roleName, schema } = await fixture();
  const helperSchema = `${schema}_helper`;
  const id = randomUUID();
  try {
    await database.query(`CREATE SCHEMA ${helperSchema}`);
    await database.query(`GRANT USAGE ON SCHEMA ${helperSchema} TO ${roleName}`);
    await database.query(`CREATE FUNCTION ${helperSchema}.erase_audit() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      BEGIN
        ALTER TABLE ${schema}.audit_events DISABLE TRIGGER audit_events_append_only;
        DELETE FROM ${schema}.audit_events;
        ALTER TABLE ${schema}.audit_events ENABLE TRIGGER audit_events_append_only;
      END; $$`);
    await runtime.query(
      `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
      VALUES($1,'system','test.definer','test','definer-erasure','{}')`,
      [id],
    );
    await runtime.query(`SELECT ${helperSchema}.erase_audit()`);
    expect((await database.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount).toBe(
      0,
    );
    await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
    await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
  } finally {
    await database.query(`DROP SCHEMA IF EXISTS ${helperSchema} CASCADE`);
  }
});

it('rejects SECURITY DEFINER triggers even without schema USAGE or function EXECUTE', async () => {
  const { runtime, database, roleName, schema } = await fixture();
  const helperSchema = `${schema}_trigger`;
  const id = randomUUID();
  try {
    await database.query(`CREATE SCHEMA ${helperSchema}`);
    await database.query(`CREATE FUNCTION ${helperSchema}.erase_audit() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      BEGIN
        ALTER TABLE ${schema}.audit_events DISABLE TRIGGER audit_events_append_only;
        DELETE FROM ${schema}.audit_events;
        ALTER TABLE ${schema}.audit_events ENABLE TRIGGER audit_events_append_only;
        RETURN NEW;
      END; $$`);
    await database.query(`REVOKE ALL ON FUNCTION ${helperSchema}.erase_audit() FROM PUBLIC`);
    await database.query(`CREATE TRIGGER indirect_audit_erasure AFTER INSERT ON roles
      FOR EACH ROW EXECUTE FUNCTION ${helperSchema}.erase_audit()`);
    await runtime.query(
      `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
      VALUES($1,'system','test.trigger','test','trigger-erasure','{}')`,
      [id],
    );
    await runtime.query("INSERT INTO roles(id,code,name) VALUES($1,'definer_trigger','Trigger')", [
      randomUUID(),
    ]);
    expect((await database.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount).toBe(
      0,
    );
    await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
    await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
  } finally {
    await database.query(`DROP SCHEMA IF EXISTS ${helperSchema} CASCADE`);
  }
});

it('rejects SECURITY DEFINER default expressions without direct schema USAGE', async () => {
  const { runtime, database, roleName, schema } = await fixture();
  const helperSchema = `${schema}_default`;
  const id = randomUUID();
  try {
    await database.query(`CREATE SCHEMA ${helperSchema}`);
    await database.query(`CREATE FUNCTION ${helperSchema}.erase_audit() RETURNS text
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      BEGIN
        ALTER TABLE ${schema}.audit_events DISABLE TRIGGER audit_events_append_only;
        DELETE FROM ${schema}.audit_events;
        ALTER TABLE ${schema}.audit_events ENABLE TRIGGER audit_events_append_only;
        RETURN 'Default';
      END; $$`);
    await database.query(
      `ALTER TABLE roles ALTER COLUMN name SET DEFAULT ${helperSchema}.erase_audit()`,
    );
    await runtime.query(
      `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
      VALUES($1,'system','test.default','test','default-erasure','{}')`,
      [id],
    );
    await runtime.query("INSERT INTO roles(id,code) VALUES($1,'definer_default')", [randomUUID()]);
    expect((await database.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount).toBe(
      0,
    );
    await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
    await expect(grantRuntimePrivileges(database, { roleName })).rejects.toThrow(
      'Runtime schema privileges are unsafe',
    );
  } finally {
    await database.query(`DROP SCHEMA IF EXISTS ${helperSchema} CASCADE`);
  }
});

it('isolates concurrent runtime fixtures from harmless PUBLIC definer routines in another fixture', async () => {
  const [first, second] = await Promise.all([fixture(), fixture()]);
  await first.database.query(`CREATE FUNCTION harmless_fixture_constant() RETURNS int
    LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`);
  try {
    await expect(assertRuntimePrivileges(second.runtime)).resolves.toBeUndefined();
    expect(
      (await first.database.query('SELECT harmless_fixture_constant() AS value')).rows[0]?.[
        'value'
      ],
    ).toBe(1);
  } finally {
    await first.database.query('DROP FUNCTION harmless_fixture_constant()');
  }
});

it('rejects a leased runtime session after its effective database CONNECT permission is removed', async () => {
  const { runtime, database } = await fixture();
  const current = await database.query<{ name: string }>('SELECT current_database() AS name');
  const [row] = current.rows;
  if (!row) throw new Error('Missing isolated test database');
  await database.query(
    `REVOKE CONNECT ON DATABASE "${row.name.replaceAll('"', '""')}" FROM PUBLIC`,
  );
  await expect(assertRuntimePrivileges(runtime)).rejects.toThrow(
    'Runtime schema privileges are unsafe',
  );
});

it('grants missing database CONNECT before reporting success so a fresh runtime connection works', async () => {
  const result = await fixture();
  const current = await result.database.query<{ name: string }>(
    'SELECT current_database() AS name',
  );
  const [row] = current.rows;
  if (!row) throw new Error('Missing isolated test database');
  await result.database.query(
    `REVOKE CONNECT ON DATABASE "${row.name.replaceAll('"', '""')}" FROM PUBLIC`,
  );
  await grantRuntimePrivileges(result.database, { roleName: result.roleName });
  const fresh = createDatabase({
    connectionString: result.runtimeConnectionString,
    schema: result.schema,
  });
  try {
    await expect(
      fresh.query(
        "SELECT current_user AS role,has_database_privilege(current_user,current_database(),'CREATE') AS can_create",
      ),
    ).resolves.toMatchObject({
      rows: [{ role: result.roleName, can_create: false }],
    });
    await assertRuntimePrivileges(fresh);
  } finally {
    await fresh.close();
  }
});
