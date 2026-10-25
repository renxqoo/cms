import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { createDatabase } from '../client.ts';
import type { SqlExecutor } from '../client.ts';
import { migrate } from '../migrate.ts';
import { roles } from '../schema/access.ts';
import * as accessSchema from '../schema/access.ts';
import * as identitySchema from '../schema/identity.ts';
import * as auditSchema from '../schema/audit.ts';
import * as platformSchema from '../schema/platform.ts';
import * as contentSchema from '../schema/content.ts';
import { createTestDatabase } from '../../../../test/support/database.ts';

const fixtures: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
async function fixture() {
  const result = await createTestDatabase();
  fixtures.push(result);
  return result.database;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((item) => item.close()));
});

describe('PostgreSQL migrations and owner schema', () => {
  it('keeps every Drizzle column and relation consistent with the independent SQL migration', async () => {
    const db = await fixture();
    const tables = [
      ...Object.values(accessSchema),
      ...Object.values(identitySchema),
      ...Object.values(auditSchema),
      ...Object.values(platformSchema),
      ...Object.values(contentSchema),
    ];
    for (const table of tables) {
      const config = getTableConfig(table);
      const physical = await db.query<{ name: string; type: string; not_null: boolean }>(
        `SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null
         FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname=current_schema() AND t.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [config.name],
      );
      expect(physical.rows).toEqual(
        config.columns.map((column) => ({
          name: column.name,
          type: column
            .getSQLType()
            .replace('varchar', 'character varying')
            .replace('char(', 'character('),
          not_null: column.notNull,
        })),
      );
      const references = config.foreignKeys.map((key) => key.reference());
      const keys = await db.query<{ count: string }>(
        "SELECT count(*) AS count FROM pg_constraint WHERE conrelid=$1::regclass AND contype='f'",
        [config.name],
      );
      expect(Number(keys.rows[0]?.count)).toBe(references.length);
    }
  });

  it('applies once and Drizzle reads the protected system role from the real database', async () => {
    const db = await fixture();
    await migrate(db);
    const result = await db.orm.select().from(roles).where(eq(roles.isSuper, true));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ code: 'super_admin', status: 'active', isSuper: true });
    const before = await db.query<{ name: string }>(
      'SELECT name FROM cms_migrations ORDER BY name',
    );
    await migrate(db);
    const after = await db.query<{ name: string }>('SELECT name FROM cms_migrations ORDER BY name');
    expect(after.rows).toEqual(before.rows);
    expect(after.rows).toContainEqual({ name: '0001_user_rbac.sql' });
    expect(after.rows).toContainEqual({ name: '0002_content.sql' });
  });

  it('upgrades an applied 0001 without changing its checksum or existing audit records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cms-migration-upgrade-'));
    try {
      await copyFile(
        fileURLToPath(new URL('../../migrations/0001_user_rbac.sql', import.meta.url)),
        join(directory, '0001_user_rbac.sql'),
      );
      const result = await createTestDatabase({ migrationDirectory: directory });
      fixtures.push(result);
      const id = randomUUID();
      await result.database.query(
        `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
        VALUES($1,'system','test.upgrade','test','existing-audit','{}')`,
        [id],
      );
      const before = await result.database.query<{ name: string; checksum: string }>(
        'SELECT name,checksum FROM cms_migrations',
      );
      await migrate(result.database);
      const after = await result.database.query<{ name: string; checksum: string }>(
        'SELECT name,checksum FROM cms_migrations ORDER BY name',
      );
      expect(after.rows.map((row) => row.name)).toEqual([
        '0001_user_rbac.sql',
        '0002_audit_truncate.sql',
        '0002_content.sql',
        '0003_collections.sql',
        '0004_content_work.sql',
        '0010_assets.sql',
        '0011_ui_api.sql',
      ]);
      expect(after.rows[0]).toEqual(before.rows[0]);
      await expect(result.database.query('TRUNCATE audit_events')).rejects.toMatchObject({
        code: '42501',
      });
      expect(
        (await result.database.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount,
      ).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves audit records when the migration owner tries TRUNCATE', async () => {
    const db = await fixture();
    const id = randomUUID();
    await db.query(
      `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
       VALUES($1,'system','test.append','test','truncate-regression','{}')`,
      [id],
    );
    await expect(db.query('TRUNCATE audit_events')).rejects.toMatchObject({ code: '42501' });
    expect((await db.query('SELECT id FROM audit_events WHERE id=$1', [id])).rowCount).toBe(1);
  });

  it('writes audit records to the application schema when a same-named temporary table exists', async () => {
    const result = await createTestDatabase();
    fixtures.push(result);
    const id = randomUUID();
    await result.database.transaction(async (tx) => {
      await tx.query(
        `CREATE TEMP TABLE audit_events(LIKE ${result.schema}.audit_events INCLUDING DEFAULTS) ON COMMIT DROP`,
      );
      await tx.query(
        `INSERT INTO audit_events(id,actor_kind,operation_id,target_type,request_id,detail)
         VALUES($1,'system','test.append','test','temp-shadow-regression','{}')`,
        [id],
      );
      const persisted = await tx.query(`SELECT id FROM ${result.schema}.audit_events WHERE id=$1`, [
        id,
      ]);
      expect(persisted.rowCount).toBe(1);
    });
  });

  it('rejects unnormalized duplicate identity and invalid token shapes', async () => {
    const db = await fixture();
    const adminId = randomUUID();
    const role = await db.query<{ id: string }>('SELECT id FROM roles WHERE is_super');
    const roleId = role.rows[0]?.id;
    await expect(
      db.query('INSERT INTO admins(id,email,role_id) VALUES($1,$2,$3)', [
        adminId,
        ' Owner@example.com ',
        roleId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await db.query('INSERT INTO admins(id,email,role_id) VALUES($1,$2,$3)', [
      adminId,
      'owner@example.com',
      roleId,
    ]);
    await expect(
      db.query('INSERT INTO admins(id,email,role_id) VALUES($1,$2,$3)', [
        randomUUID(),
        'owner@example.com',
        roleId,
      ]),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.query(
        "INSERT INTO sessions(id,admin_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",
        [randomUUID(), adminId, randomBytes(31)],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(db.query('DELETE FROM roles WHERE id=$1', [roleId])).rejects.toMatchObject({
      code: '23503',
    });
  });

  it('prevents global duplicate bindings and collection permission reuse across ranges', async () => {
    const db = await fixture();
    const global = randomUUID();
    const article = randomUUID();
    await db.query(
      "INSERT INTO permissions(id,code,name,scope_kind) VALUES($1,'admins:read','Read admins','global')",
      [global],
    );
    await db.query(
      "INSERT INTO permissions(id,code,name,scope_kind,collection_key) VALUES($1,'content:articles:read','Read articles','collection','articles')",
      [article],
    );
    await db.query(
      "INSERT INTO operation_catalog(operation_id,module,method,path,access_kind,scope_kind,binding_configurable) VALUES('admins.list','access','GET','/v1/admins','permission','global',true),('documents.list','content','GET','/v1/collections/:collection/documents','permission','collection',true)",
    );
    await db.query(
      "INSERT INTO endpoint_bindings(id,operation_id,scope_kind,permission_id) VALUES($1,'admins.list','global',$2)",
      [randomUUID(), global],
    );
    await expect(
      db.query(
        "INSERT INTO endpoint_bindings(id,operation_id,scope_kind,permission_id) VALUES($1,'admins.list','global',$2)",
        [randomUUID(), global],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.query(
        "INSERT INTO endpoint_bindings(id,operation_id,scope_kind,collection_key,permission_id) VALUES($1,'documents.list','collection','pages',$2)",
        [randomUUID(), article],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      db.query(
        "INSERT INTO endpoint_bindings(id,operation_id,scope_kind,permission_id) VALUES($1,'documents.list','collection',$2)",
        [randomUUID(), article],
      ),
    ).rejects.toMatchObject({ code: '23502' });
  });

  it('enforces single live purpose token and coherent email lifecycle', async () => {
    const db = await fixture();
    const id = randomUUID();
    const token = randomUUID();
    await db.query(
      "INSERT INTO admins(id,email,role_id) SELECT $1,'invite@example.com',id FROM roles WHERE is_super",
      [id],
    );
    await db.query(
      "INSERT INTO action_tokens(id,admin_id,purpose,token_hash,expires_at) VALUES($1,$2,'invitation',$3,now()+interval '1 day')",
      [token, id, randomBytes(32)],
    );
    await expect(
      db.query(
        "INSERT INTO action_tokens(id,admin_id,purpose,token_hash,expires_at) VALUES($1,$2,'invitation',$3,now()+interval '1 day')",
        [randomUUID(), id, randomBytes(32)],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.query(
        "INSERT INTO email_deliveries(id,action_token_id,recipient,template,status) VALUES($1,$2,'invite@example.com','invitation','accepted')",
        [randomUUID(), token],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await db.query('UPDATE action_tokens SET revoked_at=now() WHERE id=$1', [token]);
    await db.query(
      "INSERT INTO action_tokens(id,admin_id,purpose,token_hash,expires_at) VALUES($1,$2,'invitation',$3,now()+interval '1 day')",
      [randomUUID(), id, randomBytes(32)],
    );
  });
});

describe('transaction resources', () => {
  it('rejects a retained transaction executor after commit instead of writing outside the transaction', async () => {
    const db = await fixture();
    const escaped = await db.transaction((tx) => Promise.resolve(tx));
    await expect(
      escaped.query("INSERT INTO roles(id,code,name) VALUES($1,'escaped_commit','Escaped')", [
        randomUUID(),
      ]),
    ).rejects.toThrow('Transaction is no longer active');
    expect((await db.query("SELECT id FROM roles WHERE code='escaped_commit'")).rowCount).toBe(0);
  });

  it('rejects a retained transaction executor after rollback instead of autocommitting a late write', async () => {
    const db = await fixture();
    let escaped: SqlExecutor | undefined;
    await expect(
      db.transaction((tx) => {
        escaped = tx;
        return Promise.reject(new Error('outer rollback'));
      }),
    ).rejects.toThrow('outer rollback');
    if (!escaped) throw new Error('Transaction executor was not captured');
    await expect(
      escaped.query("INSERT INTO roles(id,code,name) VALUES($1,'escaped_rollback','Escaped')", [
        randomUUID(),
      ]),
    ).rejects.toThrow('Transaction is no longer active');
    expect((await db.query("SELECT id FROM roles WHERE code='escaped_rollback'")).rowCount).toBe(0);
  });

  it('handles an idle connection failure and creates a replacement connection', async () => {
    const connectionString =
      process.env.CMS_TEST_DATABASE_URL ?? 'postgresql:///postgres?host=/tmp';
    let notify: ((error: Error) => void) | undefined;
    const failed = new Promise<Error>((resolve) => {
      notify = resolve;
    });
    const db = createDatabase({ connectionString, onError: (error) => notify?.(error) });
    const control = createDatabase({
      connectionString: process.env.CMS_TEST_DATABASE_URL ?? connectionString,
    });
    try {
      const initial = await db.query<{ pid: number; address: string | null }>(
        'SELECT pg_backend_pid() AS pid,inet_server_addr()::text AS address',
      );
      const configured = await control.query<{ address: string | null }>(
        'SELECT inet_server_addr()::text AS address',
      );
      expect(initial.rows[0]?.address).toBe(configured.rows[0]?.address);
      await control.query('SELECT pg_terminate_backend($1)', [initial.rows[0]?.pid]);
      await expect(failed).resolves.toHaveProperty('code', '57P01');
      expect((await db.query('SELECT 1 AS ready')).rows[0]?.['ready']).toBe(1);
    } finally {
      await db.close();
      await control.close();
    }
  });

  it('rolls back child writes when an outer operation fails', async () => {
    const db = await fixture();
    await expect(
      db.transaction(async (tx) => {
        await tx.query("INSERT INTO roles(id,code,name) VALUES($1,'editor','Editor')", [
          randomUUID(),
        ]);
        throw new Error('audit unavailable');
      }),
    ).rejects.toThrow('audit unavailable');
    expect((await db.query("SELECT id FROM roles WHERE code='editor'")).rowCount).toBe(0);
  });

  it('cancels active SQL and restores pool capacity without committing', async () => {
    const db = await fixture();
    const controller = new AbortController();
    let announce: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const transaction = db.transaction(async (tx) => {
      await tx.query("INSERT INTO roles(id,code,name) VALUES($1,'cancelled','Cancelled')", [
        randomUUID(),
      ]);
      announce?.();
      await tx.query('SELECT pg_sleep(2)');
    }, controller.signal);
    await started;
    controller.abort();
    await expect(transaction).rejects.toThrow(/terminated|abort/i);
    expect((await db.query("SELECT id FROM roles WHERE code='cancelled'")).rowCount).toBe(0);
    expect((await db.query('SELECT 1 AS ready')).rows[0]?.['ready']).toBe(1);
  });

  it('does not silently commit after a caller catches a PostgreSQL transaction error', async () => {
    const db = await fixture();
    await expect(
      db.transaction(async (tx) => {
        try {
          await tx.query('SELECT * FROM missing_table');
        } catch {
          return 'caught';
        }
        return 'unexpected';
      }),
    ).rejects.toThrow('Transaction did not commit');
  });

  it('rejects a schema option that could escape SQL connection settings', () => {
    expect(() =>
      createDatabase({
        connectionString: process.env.CMS_TEST_DATABASE_URL ?? 'postgresql:///postgres?host=/tmp',
        schema: 'x -c search_path=public',
      }),
    ).toThrow('Invalid database schema');
  });
});
