import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createTestDatabase } from '../../../../test/support/database.ts';
import { createLibraryMigrationDirectory } from '../../../../test/support/library-migrations.ts';
import { migrate } from '../migrate.ts';

it('regression: authorship migration never invents a creator from a pruned earliest remaining revision', async () => {
  const library = await createLibraryMigrationDirectory();
  const before = await mkdtemp(join(tmpdir(), 'cms-before-authorship-'));
  let kit: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  try {
    for (const name of await readdir(library.directory))
      if (name < '0022') await copyFile(join(library.directory, name), join(before, name));
    kit = await createTestDatabase({ migrationDirectory: before });
    const creator = randomUUID(),
      updater = randomUUID(),
      first = randomUUID(),
      pruned = randomUUID(),
      firstVersion = randomUUID(),
      currentVersion = randomUUID();
    await kit.database.query(
      "INSERT INTO admins(id,email,role_id) SELECT id,email,role_id FROM (VALUES($1::uuid,'creator@example.test'),($2::uuid,'updater@example.test')) people(id,email) CROSS JOIN (SELECT id AS role_id FROM roles WHERE is_super) role",
      [creator, updater],
    );
    await kit.database.query(
      "INSERT INTO content_documents(id,collection_id,revision) VALUES($1,'legacy',1),($2,'legacy',3)",
      [first, pruned],
    );
    await kit.database.query(
      "INSERT INTO content_revisions(id,document_id,collection_id,revision,schema_version,kind,actor_id) VALUES($1,$2,'legacy',1,1,'save',$3),($4,$5,'legacy',3,1,'save',$6)",
      [firstVersion, first, creator, currentVersion, pruned, updater],
    );
    await kit.database.query(
      'UPDATE content_documents SET current_version_id=CASE WHEN id=$1 THEN $2::uuid ELSE $3::uuid END WHERE id=ANY($4::uuid[])',
      [first, firstVersion, currentVersion, [first, pruned]],
    );
    await migrate(kit.database, { directory: library.directory });
    const rows = await kit.database.query<{
      id: string;
      created_by: string | null;
      updated_by: string | null;
    }>('SELECT id,created_by,updated_by FROM content_documents ORDER BY revision');
    expect(rows.rows).toEqual([
      { id: first, created_by: creator, updated_by: creator },
      { id: pruned, created_by: null, updated_by: updater },
    ]);
  } finally {
    await kit?.close();
    await rm(before, { recursive: true, force: true });
    await library.close();
  }
});
