import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { migrate } from '../migrate.ts';
import { createTestDatabase } from '../../../../test/support/database.ts';

it('refuses to invent an authorization locale for active legacy asset work and permits upgrade after draining it', async () => {
  const previous = await mkdtemp(join(tmpdir(), 'cms-before-collaboration-'));
  const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url));
  let kit: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  try {
    for (const name of await readdir(migrations))
      if (name.endsWith('.sql') && name < '0012')
        await copyFile(join(migrations, name), join(previous, name));
    kit = await createTestDatabase({ migrationDirectory: previous });
    const actor = randomUUID();
    await kit.database.query(
      "INSERT INTO admins(id,email,role_id) SELECT $1,'migration@example.test',id FROM roles WHERE is_super",
      [actor],
    );
    const upload = randomUUID();
    await kit.database.query(
      "INSERT INTO asset_uploads(id,actor_id,collection_key,purpose,filename,declared_type,declared_bytes,settings,status,expires_at) VALUES($1,$2,'media','create','file.pdf','application/pdf',100,'{}','pending',clock_timestamp()+interval '1 hour')",
      [upload, actor],
    );
    await expect(migrate(kit.database)).rejects.toThrow('Drain asset uploads and processing jobs');
    expect(
      (
        await kit.database.query(
          "SELECT 1 FROM cms_migrations WHERE name='0012_editor_collaboration.sql'",
        )
      ).rowCount,
    ).toBe(0);
    await kit.database.query("UPDATE asset_uploads SET status='cancelled' WHERE id=$1", [upload]);
    await migrate(kit.database);
    expect(
      (
        await kit.database.query<{ authorization_locale: null }>(
          'SELECT authorization_locale FROM asset_uploads WHERE id=$1',
          [upload],
        )
      ).rows,
    ).toEqual([{ authorization_locale: null }]);
    await expect(
      kit.database.query("UPDATE asset_uploads SET status='pending' WHERE id=$1", [upload]),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await kit?.close();
    await rm(previous, { recursive: true, force: true });
  }
});
