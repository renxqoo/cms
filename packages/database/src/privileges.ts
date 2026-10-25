import type { Database, SqlExecutor } from './client.ts';

export interface RuntimeRoleOptions {
  roleName: string;
}

interface RoleContext {
  roleName: string;
  schema: string;
}

const tablePrivileges = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
];
const runtimeTables = [
  'roles',
  'admins',
  'credentials',
  'sessions',
  'action_tokens',
  'email_deliveries',
  'permissions',
  'role_permissions',
  'navigation_nodes',
  'operation_catalog',
  'endpoint_bindings',
  'audit_events',
  'idempotency_records',
  'rate_limit_buckets',
  'cms_migrations',
];

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function requiredPrivileges(table: string): string[] {
  if (table === 'audit_events') return ['SELECT', 'INSERT'];
  if (table === 'operation_catalog' || table === 'cms_migrations') return ['SELECT'];
  return ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
}

async function roleContext(tx: SqlExecutor, roleName?: string): Promise<RoleContext> {
  const result = await tx.query<{ role_name: string; session_name: string; schema: string | null }>(
    'SELECT current_user AS role_name,session_user AS session_name,current_schema() AS schema',
  );
  const [row] = result.rows;
  if (!row?.schema) throw new Error('Runtime database schema is unavailable');
  if (roleName === undefined && row.role_name !== row.session_name) {
    throw new Error('Runtime database must use its dedicated login role');
  }
  return { roleName: roleName ?? row.role_name, schema: row.schema };
}

async function assertRole(tx: SqlExecutor, context: RoleContext): Promise<void> {
  const result = await tx.query<{ safe: boolean }>(
    `SELECT NOT (r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND r.rolcanlogin
      AND NOT EXISTS(SELECT 1 FROM pg_roles parent WHERE parent.oid<>r.oid AND pg_has_role(r.oid,parent.oid,'MEMBER'))
      AND NOT EXISTS(
        SELECT 1 FROM (
          SELECT datdba AS owner FROM pg_database WHERE datname=current_database()
          UNION SELECT nspowner FROM pg_namespace WHERE nspname=$2
          UNION SELECT c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2
          UNION SELECT p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$2
          UNION SELECT t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=$2
        ) owners WHERE pg_has_role(r.oid,owners.owner,'MEMBER')
      ) AS safe FROM pg_roles r WHERE r.rolname=$1`,
    [context.roleName, context.schema],
  );
  if (result.rows[0]?.safe !== true)
    throw new Error('Runtime role attributes or ownership are unsafe');
}

async function assertSchema(tx: SqlExecutor, context: RoleContext): Promise<void> {
  const result = await tx.query<{ safe: boolean }>(
    `SELECT has_schema_privilege($1,$2,'USAGE') AND NOT has_schema_privilege($1,$2,'CREATE')
      AND has_database_privilege($1,current_database(),'CONNECT')
      AND NOT has_database_privilege($1,current_database(),'CREATE')
      AND NOT EXISTS(
        SELECT 1 FROM pg_namespace n
        WHERE n.nspname !~ '^pg_(toast_)?temp_[0-9]+$' AND has_schema_privilege($1,n.oid,'CREATE')
      )
      AND NOT EXISTS(
        SELECT 1 FROM pg_proc p WHERE p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE')
      )
      AND NOT EXISTS(
        SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
        JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$2 AND p.prosecdef AND t.tgenabled<>'D'
          AND (has_table_privilege($1,c.oid,'INSERT,UPDATE,DELETE')
            OR has_any_column_privilege($1,c.oid,'INSERT,UPDATE'))
      ) AS safe`,
    [context.roleName, context.schema],
  );
  if (result.rows[0]?.safe !== true) throw new Error('Runtime schema privileges are unsafe');
}

async function assertTables(tx: SqlExecutor, context: RoleContext): Promise<void> {
  const result = await tx.query<{
    name: string;
    privileges: string[];
    grantable: boolean;
    column_extra: boolean;
  }>(
    `SELECT c.relname AS name,
      ARRAY(SELECT p FROM unnest($3::text[]) p WHERE has_table_privilege($1,c.oid,p)) AS privileges,
      EXISTS(SELECT 1 FROM unnest($3::text[]) p WHERE has_table_privilege($1,c.oid,p || ' WITH GRANT OPTION')) AS grantable,
      has_any_column_privilege($1,c.oid,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')
        OR has_any_column_privilege($1,c.oid,'REFERENCES')
        OR (c.relname IN ('audit_events','operation_catalog','cms_migrations') AND has_any_column_privilege($1,c.oid,'UPDATE'))
        OR (c.relname IN ('operation_catalog','cms_migrations') AND has_any_column_privilege($1,c.oid,'INSERT')) AS column_extra
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=$2 AND c.relkind IN ('r','p','v','m','f')`,
    [context.roleName, context.schema, tablePrivileges],
  );
  if (result.rows.length !== runtimeTables.length)
    throw new Error('Runtime database tables differ from the supported schema');
  for (const row of result.rows) {
    const required = requiredPrivileges(row.name);
    if (
      !runtimeTables.includes(row.name) ||
      row.grantable ||
      row.column_extra ||
      required.join() !== row.privileges.join()
    ) {
      throw new Error('Runtime table privileges are unsafe or incomplete');
    }
  }
}

async function assertAuditGuard(tx: SqlExecutor, context: RoleContext): Promise<void> {
  const result = await tx.query<{ protected: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace f ON f.oid=p.pronamespace
      WHERE n.nspname=$1 AND c.relname='audit_events'
        AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgenabled IN ('O','A')
        AND t.tgqual IS NULL AND t.tgnargs=0
        AND f.nspname=$1 AND p.proname='cms_protect_audit_events'
        AND p.pronargs=0 AND p.prorettype='trigger'::regtype
    ) AS protected`,
    [context.schema],
  );
  if (result.rows[0]?.protected !== true)
    throw new Error('Audit append-only protection is unavailable');
}

async function assertPrivileges(tx: SqlExecutor, context: RoleContext): Promise<void> {
  await assertRole(tx, context);
  await assertSchema(tx, context);
  await assertTables(tx, context);
  await assertAuditGuard(tx, context);
}

export async function assertRuntimePrivileges(database: SqlExecutor): Promise<void> {
  await assertPrivileges(database, await roleContext(database));
}

async function grantConnection(tx: SqlExecutor, context: RoleContext): Promise<void> {
  const result = await tx.query<{ name: string; allowed: boolean }>(
    "SELECT current_database() AS name,has_database_privilege($1,current_database(),'CONNECT') AS allowed",
    [context.roleName],
  );
  const [database] = result.rows;
  if (!database) throw new Error('Runtime database is unavailable');
  if (database.allowed) return;
  await tx.query(
    `GRANT CONNECT ON DATABASE ${identifier(database.name)} TO ${identifier(context.roleName)}`,
  );
}

export async function grantRuntimePrivileges(
  database: Database,
  options: RuntimeRoleOptions,
): Promise<void> {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(options.roleName))
    throw new Error('Invalid runtime role name');
  await database.transaction(async (tx) => {
    const context = await roleContext(tx, options.roleName);
    await assertRole(tx, context);
    await grantConnection(tx, context);
    const role = identifier(context.roleName);
    const schema = identifier(context.schema);
    await tx.query(`REVOKE ALL PRIVILEGES ON SCHEMA ${schema} FROM ${role}`);
    await tx.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`);
    await tx.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    for (const table of runtimeTables) {
      await tx.query(
        `GRANT ${requiredPrivileges(table).join(',')} ON TABLE ${schema}.${identifier(table)} TO ${role}`,
      );
    }
    await assertPrivileges(tx, context);
  });
}
