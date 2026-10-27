import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '../client.ts';
import { z } from 'zod';
import { parsePhysicalPlan } from '@new-cms/database/codegen';
import {
  createTestDatabase,
  testDatabaseConnectionString,
} from '../../../../test/support/database.ts';
import { createLibraryMigrationDirectory } from '../../../../test/support/library-migrations.ts';
import { createContentFixture } from '../../../../test/support/content-runtime.ts';

const resources: { close(): Promise<void> }[] = [];
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const resource of resources.splice(0).toReversed()) await resource.close();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function nativeTables(kit: Awaited<ReturnType<typeof createTestDatabase>>) {
  const result = await kit.database.query<{ name: string }>(
    "SELECT relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relkind IN('r','p') AND left(c.relname,3) IN('cf_','ci_','cu_') ORDER BY c.relname",
  );
  return result.rows.map((row) => row.name);
}
it('default full fixture keeps every production migration and the application native tables', async () => {
  const kit = await createTestDatabase();
  resources.push(kit);
  const applied = await kit.database.query<{ name: string }>(
    'SELECT name FROM cms_migrations ORDER BY name',
  );
  expect(applied.rows.map((row) => row.name)).toEqual([
    '0001_user_rbac.sql',
    '0002_audit_truncate.sql',
    '0002_content.sql',
    '0003_collections.sql',
    '0004_content_work.sql',
    '0010_assets.sql',
    '0011_ui_api.sql',
    '0012_editor_collaboration.sql',
    '0013_query_presets.sql',
    '0014_localized_publications.sql',
    '0015_delegated_credentials.sql',
    '0015_hierarchy_validation.sql',
    '0015_oneaster_content.sql',
    '0016_content_preview_grants.sql',
    '0016_wgs84_distance.sql',
    '0017_publication_references.sql',
    '0018_extension_source_locale.sql',
    '0019_document_order.sql',
    '0020_content_taxonomy.sql',
    '0021_delegated_editor_leases.sql',
    '0022_content_authorship.sql',
    '0023_join_order_scopes.sql',
    '0024_query_preset_access.sql',
  ]);
  const manifest = z
    .object({ next: z.object({ plan: z.unknown() }) })
    .parse(
      JSON.parse(
        await readFile(
          fileURLToPath(
            new URL('../../migrations/0015_oneaster_content.plan.json', import.meta.url),
          ),
          'utf8',
        ),
      ),
    );
  const plan = parsePhysicalPlan(manifest.next.plan);
  const physical = new Set(await nativeTables(kit));
  expect(plan.tables.length).toBeGreaterThan(500);
  expect(plan.tables.every((table) => physical.has(table.name))).toBe(true);
});
it('explicit library fixture omits application native DDL but keeps localized publication and preview schema', async () => {
  const kit = await createTestDatabase({ migrationScope: 'library' });
  resources.push(kit);
  expect(await nativeTables(kit)).toEqual([]);
  const result = await kit.database.query<{ name: string }>(
    'SELECT name FROM cms_migrations ORDER BY name',
  );
  expect(result.rows.map((row) => row.name)).toEqual([
    '0001_user_rbac.sql',
    '0002_audit_truncate.sql',
    '0002_content.sql',
    '0004_content_work.sql',
    '0010_assets.sql',
    '0011_ui_api.sql',
    '0012_editor_collaboration.sql',
    '0013_query_presets.sql',
    '0014_localized_publications.sql',
    '0015_delegated_credentials.sql',
    '0015_hierarchy_validation.sql',
    '0016_content_preview_grants.sql',
    '0016_wgs84_distance.sql',
    '0017_publication_references.sql',
    '0018_extension_source_locale.sql',
    '0019_document_order.sql',
    '0021_delegated_editor_leases.sql',
    '0022_content_authorship.sql',
    '0023_join_order_scopes.sql',
    '0024_query_preset_access.sql',
  ]);
  for (const table of [
    'admins',
    'roles',
    'permissions',
    'audit_events',
    'asset_manifests',
    'content_documents',
    'content_publications',
    'content_preview_grants',
  ]) {
    const found = await kit.database.query<{ name: string | null }>(
      'SELECT to_regclass($1)::text AS name',
      [table],
    );
    expect(found.rows[0]?.name).toBe(table);
  }
});
it('light content fixture creates all its own mapped native tables and publishes a real document', async () => {
  const kit = await createContentFixture();
  resources.push(kit);
  const physical = await nativeTables(kit);
  const own = kit.artifacts.mapping.plan.tables.map((table) => table.name).toSorted();
  expect(physical).toHaveLength(own.length);
  expect(physical).toEqual(own);
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'Library native fixture', slug: 'library-native' },
  });
  await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
    locale: 'en',
  });
  const read = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    locale: 'en',
    mode: 'published',
  });
  expect(read.data['title']).toBe('Library native fixture');
  expect(read.data['slug']).toBe('library-native');
});

it('library migration directory preserves generic SQL bytes read-only and is removed on close', async () => {
  const directory = await createLibraryMigrationDirectory();
  resources.push(directory);
  const files = await readdir(directory.directory);
  expect(files).toContain('0016_content_preview_grants.sql');
  expect(files).not.toContain('0003_collections.sql');
  expect(files).not.toContain('0015_oneaster_content.sql');
  for (const file of files) {
    const copied = join(directory.directory, file);
    expect(await readFile(copied)).toEqual(
      await readFile(fileURLToPath(new URL(`../../migrations/${file}`, import.meta.url))),
    );
    expect((await stat(copied)).mode & 0o222).toBe(0);
  }
  await directory.close();
  await expect(stat(directory.directory)).rejects.toMatchObject({ code: 'ENOENT' });
  await directory.close();
});

it('failed library migration releases its schema, backend connection and prepared directory', async () => {
  const source = await mkdtemp(join(tmpdir(), 'cms-failed-library-source-'));
  const temporary = await mkdtemp(join(tmpdir(), 'cms-failed-library-output-'));
  directories.push(source, temporary);
  await writeFile(
    join(source, '0001_failure.sql'),
    `DO $$ BEGIN RAISE EXCEPTION USING MESSAGE='Fixture migration failure', DETAIL=current_schema() || '|' || pg_backend_pid()::text; END $$;`,
  );
  vi.stubEnv('TMPDIR', temporary);
  const failure: unknown = await createTestDatabase({
    migrationScope: 'library',
    migrationDirectory: source,
  }).then(
    (kit) => {
      resources.push(kit);
      throw new Error('Expected migration failure');
    },
    (error: unknown) => error,
  );
  const error = z
    .object({ message: z.literal('Fixture migration failure'), detail: z.string() })
    .parse(failure);
  const [schema, backend] = error.detail.split('|');
  expect(schema).toMatch(/^cms_test_[a-f0-9]{32}$/u);
  expect(backend).toMatch(/^[0-9]+$/u);
  const observer = createDatabase({
    connectionString: testDatabaseConnectionString(),
    maxConnections: 1,
  });
  resources.push(observer);
  const namespace = await observer.query(
    'SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=$1',
    [schema],
  );
  expect(namespace.rowCount).toBe(0);
  await vi.waitFor(async () => {
    expect(
      (
        await observer.query('SELECT pid FROM pg_catalog.pg_stat_activity WHERE pid=$1', [
          Number(backend),
        ])
      ).rowCount,
    ).toBe(0);
  });
  expect(await readdir(temporary)).toEqual([]);
});
