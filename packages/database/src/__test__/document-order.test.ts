import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../test/support/database.ts';
import { createTestRuntimeDatabase } from '../../../../test/support/runtime-database.ts';
import { migrate } from '../migrate.ts';
import { assertRuntimePrivileges, grantRuntimePrivileges } from '../privileges.ts';

const fixtures: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('migrates existing documents in stable creation order and uses one trigger for later inserts and purges', async () => {
  const source = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'cms-order-upgrade-'));
  try {
    for (const name of await readdir(source))
      if (name.endsWith('.sql') && name < '0019_document_order.sql')
        await copyFile(join(source, name), join(directory, name));
    const kit = await createTestDatabase({ migrationDirectory: directory });
    fixtures.push(kit);
    const first = randomUUID(),
      second = randomUUID();
    await kit.database.query(
      "INSERT INTO content_documents(id,collection_id,created_at) VALUES($1,'legacy','2026-10-25'),($2,'legacy','2026-10-26')",
      [first, second],
    );
    await migrate(kit.database);
    expect(
      (await kit.database.query('SELECT document_id FROM content_document_order ORDER BY position'))
        .rows,
    ).toEqual([{ document_id: first }, { document_id: second }]);
    const next = randomUUID();
    await kit.database.query("INSERT INTO content_documents(id,collection_id)VALUES($1,'legacy')", [
      next,
    ]);
    expect(
      (await kit.database.query('SELECT document_id FROM content_document_order ORDER BY position'))
        .rows,
    ).toEqual([{ document_id: first }, { document_id: second }, { document_id: next }]);
    const before = await kit.database.query('SELECT version FROM content_order_control');
    await kit.database.query('DELETE FROM content_documents WHERE id=$1', [second]);
    expect(
      (await kit.database.query('SELECT version FROM content_order_control')).rows,
    ).not.toEqual(before.rows);
    expect(
      (
        await kit.database.query('SELECT 1 FROM content_document_order WHERE document_id=$1', [
          second,
        ])
      ).rowCount,
    ).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it('allows dedicated-role append and cascade tracking without function EXECUTE or extra table privileges', async () => {
  const kit = await createTestRuntimeDatabase();
  fixtures.push(kit);
  await grantRuntimePrivileges(kit.database, { roleName: kit.roleName });
  const id = randomUUID();
  await kit.runtime.query("INSERT INTO content_documents(id,collection_id)VALUES($1,'runtime')", [
    id,
  ]);
  expect(
    (
      await kit.runtime.query(
        'SELECT position::text FROM content_document_order WHERE document_id=$1',
        [id],
      )
    ).rows,
  ).toEqual([{ position: '1' }]);
  await kit.runtime.query('DELETE FROM content_documents WHERE id=$1', [id]);
  expect((await kit.runtime.query('SELECT 1 FROM content_document_order')).rowCount).toBe(0);
  await assertRuntimePrivileges(kit.runtime);
  await expect(kit.runtime.query('SELECT cms_track_document_order()')).rejects.toMatchObject({
    code: '42501',
  });
  await expect(
    kit.runtime.query('SELECT cms_guard_document_order_identity()'),
  ).rejects.toMatchObject({ code: '42501' });
  await expect(kit.runtime.query('DELETE FROM content_order_control')).rejects.toMatchObject({
    code: '42501',
  });
  await kit.database.query(
    'ALTER TABLE content_documents DISABLE TRIGGER content_documents_track_order',
  );
  await expect(assertRuntimePrivileges(kit.runtime)).rejects.toThrow(
    'Document order tracking is unavailable or unsafe',
  );
  await kit.database.query(
    'ALTER TABLE content_documents ENABLE TRIGGER content_documents_track_order',
  );
  await kit.database.query('GRANT EXECUTE ON FUNCTION cms_track_document_order() TO PUBLIC');
  await expect(assertRuntimePrivileges(kit.runtime)).rejects.toThrow(
    'Document order tracking is unavailable or unsafe',
  );
});
