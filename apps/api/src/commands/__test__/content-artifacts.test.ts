import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { parseGenerationCommand } from '../content-migration.ts';
import { writeContentArtifacts } from '../content-artifacts.ts';
import { createRegistry, generateArtifacts } from '@new-cms/cms/content/generate';
import type { CollectionDefinition, FieldDefinition } from '@new-cms/cms/content/generate';
import { contentLimits } from '../../../../../test/support/content.ts';

const directories: string[] = [];
it('parses generation/check/manual-review CLI forms and rejects ambiguous or incomplete arguments', () => {
  expect(parseGenerationCommand([])).toEqual({
    check: false,
    migration: undefined,
    reviewedPath: undefined,
  });
  expect(parseGenerationCommand(['--check'])).toMatchObject({ check: true });
  expect(
    parseGenerationCommand([
      '--migration',
      '0011_change.sql',
      '--check',
      '--reviewed-sql',
      'reviewed.sql',
    ]),
  ).toEqual({ check: true, migration: '0011_change.sql', reviewedPath: 'reviewed.sql' });
  for (const args of [
    ['--unknown'],
    ['--check', '--check'],
    ['--migration'],
    ['--migration', '--check'],
    ['--migration', 'one.sql', '--migration', 'two.sql'],
    ['--reviewed-sql', 'review.sql'],
    ['--migration', 'one.sql', '--reviewed-sql'],
  ])
    expect(() => parseGenerationCommand(args)).toThrowError(
      /Invalid generation arguments|Reviewed SQL requires --migration/,
    );
});
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'cms-content-artifacts-'));
  directories.push(path);
  return path;
}

it('generates deterministic artifacts without database, storage or existing generated schema', async () => {
  const root = await directory();
  await writeContentArtifacts({ root, check: false, migration: '0003_collections.sql' });
  await expect(
    writeContentArtifacts({ root, check: true, migration: '0003_collections.sql' }),
  ).resolves.toBeUndefined();
  const schema = join(root, 'packages/database/src/schema/generated/content.ts');
  await symlink(
    join(process.cwd(), 'packages/database/node_modules'),
    join(root, 'node_modules'),
    'dir',
  );
  const imported = spawnSync(process.execPath, [schema], {
    encoding: 'utf8',
    timeout: 5000,
    env: { PATH: process.env.PATH },
  });
  expect(imported.error).toBeUndefined();
  expect(imported.stderr).toBe('');
  expect(imported.status).toBe(0);
  const source = await readFile(schema, 'utf8');
  expect(source).toContain('contentMappingFingerprint');
  await writeFile(schema, `${source}\ninvalid drift\n`);
  await expect(writeContentArtifacts({ root, check: true })).rejects.toThrow('artifact differs');
});

it('refuses to overwrite a reviewed migration or escape the migration directory', async () => {
  const root = await directory();
  await writeContentArtifacts({ root, check: false, migration: '0003_collections.sql' });
  const migration = join(root, 'packages/database/migrations/0003_collections.sql');
  await writeFile(migration, 'SELECT 1;\n');
  await expect(
    writeContentArtifacts({ root, check: false, migration: '0003_collections.sql' }),
  ).rejects.toThrow('cannot be overwritten');
  expect(await readFile(migration, 'utf8')).toBe('SELECT 1;\n');
  await expect(
    writeContentArtifacts({ root, check: false, migration: '../outside.sql' }),
  ).rejects.toThrow('Invalid migration');
});

it('detects missing generated artifacts before a deployment can claim matching code', async () => {
  const root = await directory();
  await expect(writeContentArtifacts({ root, check: true })).rejects.toThrow('artifact differs');
  await writeContentArtifacts({ root, check: false, migration: '0003_collections.sql' });
  const path = join(root, 'apps/api/src/config/collections.schema.generated.json');
  await rm(path);
  await expect(writeContentArtifacts({ root, check: true })).rejects.toThrow('artifact differs');
});

function registry(fields: readonly FieldDefinition[], previous?: CollectionDefinition) {
  const definition: CollectionDefinition = {
    id: 'artifact_records',
    key: 'records',
    label: 'Records',
    schemaVersion: previous ? previous.schemaVersion + 1 : 1,
    mode: 'direct',
    history: false,
    locales: { default: 'en', supported: ['en'], fallback: {} },
    fields,
    ...(previous
      ? {
          previousSchemas: [previous],
          migrations: [{ from: previous.schemaVersion, version: '1', transform: (data) => data }],
        }
      : {}),
  };
  return createRegistry({ collections: [definition], limits: contentLimits() });
}
const title: FieldDefinition = { id: 'title', name: 'title', type: 'text' };

it('keeps the prior plan until an incremental migration is named and replays its original comparison after generation', async () => {
  const root = await directory();
  const before = registry([title]);
  await writeContentArtifacts({
    root,
    check: false,
    migration: '0005_initial.sql',
    registry: before,
  });
  const snapshotFile = join(root, 'packages/database/src/schema/generated/content-snapshot.json');
  const original = await readFile(snapshotFile, 'utf8');
  const next = registry(
    [title, { id: 'rating', name: 'rating', type: 'number' }],
    before.get('records'),
  );
  await expect(writeContentArtifacts({ root, check: false, registry: next })).rejects.toThrow(
    'require a new reviewed --migration',
  );
  expect(await readFile(snapshotFile, 'utf8')).toBe(original);
  const options = { root, check: false, migration: '0006_rating.sql', registry: next };
  await writeContentArtifacts(options);
  const sql = await readFile(join(root, 'packages/database/migrations/0006_rating.sql'), 'utf8');
  for (const table of generateArtifacts(before).snapshot.plan.tables)
    expect(sql).not.toContain(`CREATE TABLE "${table.name}"`);
  expect(sql).toContain('CREATE TABLE');
  const plan = z
    .strictObject({ version: z.literal(1), previous: z.unknown(), next: z.unknown() })
    .parse(
      JSON.parse(
        await readFile(join(root, 'packages/database/migrations/0006_rating.plan.json'), 'utf8'),
      ),
    );
  expect(plan.previous).toEqual(JSON.parse(original));
  expect(plan.next).toEqual(JSON.parse(await readFile(snapshotFile, 'utf8')));
  await expect(writeContentArtifacts({ ...options, check: true })).resolves.toBeUndefined();
  await expect(
    writeContentArtifacts({ root, check: true, registry: next }),
  ).resolves.toBeUndefined();
  await expect(writeContentArtifacts({ ...options, migration: '0007_empty.sql' })).rejects.toThrow(
    'No schema migration',
  );
});

it('requires an initial migration and refuses destructive schema changes before any generated file changes', async () => {
  const root = await directory();
  const before = registry([title]);
  await expect(writeContentArtifacts({ root, check: false, registry: before })).rejects.toThrow(
    'requires --migration',
  );
  await writeContentArtifacts({
    root,
    check: false,
    migration: '0005_initial.sql',
    registry: before,
  });
  const path = join(root, 'apps/api/src/config/collections.generated.ts');
  const original = await readFile(path, 'utf8');
  await expect(
    writeContentArtifacts({
      root,
      check: false,
      migration: '0006_removed.sql',
      registry: registry([]),
    }),
  ).rejects.toThrow('Manual schema migration');
  expect(await readFile(path, 'utf8')).toBe(original);
  await expect(
    readFile(join(root, 'packages/database/migrations/0006_removed.sql'), 'utf8'),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects stale reviewed snapshots and malformed current snapshots without overwriting migrations', async () => {
  const root = await directory();
  const before = registry([title]);
  const options = { root, check: false, migration: '0005_initial.sql', registry: before };
  await writeContentArtifacts(options);
  const next = registry([title, { id: 'flag', name: 'flag', type: 'boolean' }]);
  await expect(writeContentArtifacts({ ...options, registry: next })).rejects.toThrow(
    'snapshot differs',
  );
  await writeFile(
    join(root, 'packages/database/src/schema/generated/content-snapshot.json'),
    '{"plan":{},"collections":[]}',
  );
  await expect(writeContentArtifacts({ root, check: false, registry: next })).rejects.toThrow(
    'invalid input',
  );
  await expect(
    writeContentArtifacts({ ...options, migration: '0006_invalid.sql', registry: next }),
  ).rejects.toThrow('invalid input');
});

it('requires explicit reviewed SQL for a collection scope rename and durably replays the reviewed text', async () => {
  const root = await directory();
  const before = registry([title]);
  await writeContentArtifacts({
    root,
    check: false,
    migration: '0005_initial.sql',
    registry: before,
  });
  const next = createRegistry({
    collections: [{ ...before.get('records'), key: 'renamed' }],
    limits: contentLimits(),
  });
  const options = { root, check: false, migration: '0006_scope.sql', registry: next };
  await expect(writeContentArtifacts(options)).rejects.toThrow('collectionKeyMigrationRequired');
  const reviewedSql =
    "UPDATE content_jobs SET collection_key='renamed' WHERE collection_key='records';\n";
  await writeContentArtifacts({ ...options, reviewedSql });
  const sql = join(root, 'packages/database/migrations/0006_scope.sql');
  const source = await readFile(sql, 'utf8');
  expect(source.endsWith(reviewedSql)).toBe(true);
  await expect(writeContentArtifacts({ ...options, check: true })).resolves.toBeUndefined();
  await expect(
    writeContentArtifacts({ ...options, reviewedSql: `${reviewedSql}SELECT 2;` }),
  ).rejects.toThrow('Existing reviewed SQL');
  await rm(sql);
  await writeContentArtifacts(options);
  expect(await readFile(sql, 'utf8')).toBe(source);
  await expect(
    writeContentArtifacts({ root, check: true, registry: next }),
  ).resolves.toBeUndefined();
});

it('rejects reviewed SQL without a manual plan, an explicit migration, or nonempty review text', async () => {
  const root = await directory();
  const before = registry([title]);
  await expect(
    writeContentArtifacts({ root, check: false, reviewedSql: 'SELECT 1;' }),
  ).rejects.toThrow('requires --migration');
  await expect(
    writeContentArtifacts({
      root,
      check: false,
      migration: '0005_initial.sql',
      registry: before,
      reviewedSql: 'SELECT 1;',
    }),
  ).rejects.toThrow('Initial generation');
  await writeContentArtifacts({
    root,
    check: false,
    migration: '0005_initial.sql',
    registry: before,
  });
  const next = registry(
    [title, { id: 'rating', name: 'rating', type: 'number' }],
    before.get('records'),
  );
  await expect(
    writeContentArtifacts({
      root,
      check: false,
      migration: '0006_automatic.sql',
      registry: next,
      reviewedSql: 'SELECT 1;',
    }),
  ).rejects.toThrow('requires a manual');
  const renamed = createRegistry({
    collections: [{ ...before.get('records'), key: 'renamed' }],
    limits: contentLimits(),
  });
  await expect(
    writeContentArtifacts({
      root,
      check: false,
      migration: '0006_empty.sql',
      registry: renamed,
      reviewedSql: ' \n',
    }),
  ).rejects.toThrow('requires a manual');
});
