import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createTestDatabase } from '../../../../test/support/database.ts';
import { migrate } from '../migrate.ts';
import { contentDocumentOrder, contentOrderControl } from '../schema/content-admin.ts';
import { getTableConfig } from 'drizzle-orm/pg-core';

it('upgrades existing base order once and protects immutable Join fallback positions and scope identities', async () => {
  const migrations = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'cms-join-order-upgrade-'));
  let kit: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  try {
    for (const name of await readdir(migrations))
      if (name.endsWith('.sql') && name < '0023_join_order_scopes.sql')
        await copyFile(join(migrations, name), join(directory, name));
    kit = await createTestDatabase({ migrationDirectory: directory });
    const id = randomUUID();
    await kit.database.query("INSERT INTO content_documents(id,collection_id)VALUES($1,'legacy')", [
      id,
    ]);
    await kit.database.query('UPDATE content_document_order SET position=9 WHERE document_id=$1', [
      id,
    ]);
    await migrate(kit.database);
    expect(
      (
        await kit.database.query(
          'SELECT document_id,scope_key,position::text,initial_position::text FROM content_document_order',
        )
      ).rows,
    ).toEqual([{ document_id: id, scope_key: '', position: '9', initial_position: '9' }]);
    await kit.database.query(
      "INSERT INTO content_order_control(collection_id,scope_key)VALUES('legacy','join')",
    );
    await kit.database.query(
      "INSERT INTO content_document_order(document_id,collection_id,scope_key,position)VALUES($1,'legacy','join',0.5)",
      [id],
    );
    expect(
      (
        await kit.database.query(
          'SELECT count(*)::int AS count FROM content_document_order WHERE document_id=$1',
          [id],
        )
      ).rows,
    ).toEqual([{ count: 2 }]);
    for (const patch of [
      'initial_position=10',
      "scope_key='changed'",
      "collection_id='other'",
      'document_id=gen_random_uuid()',
    ])
      await expect(
        kit.database.query(
          `UPDATE content_document_order SET ${patch} WHERE document_id=$1 AND scope_key=''`,
          [id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    await kit.database.query(
      "UPDATE content_document_order SET position=0.25 WHERE document_id=$1 AND scope_key='join'",
      [id],
    );
    expect(
      (
        await kit.database.query(
          "SELECT initial_position::text FROM content_document_order WHERE document_id=$1 AND scope_key=''",
          [id],
        )
      ).rows,
    ).toEqual([{ initial_position: '9' }]);
    const control = getTableConfig(contentOrderControl);
    const ranks = getTableConfig(contentDocumentOrder);
    expect(control.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'collection_id',
      'scope_key',
    ]);
    expect(ranks.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'document_id',
      'scope_key',
    ]);
    expect(ranks.columns.map((column) => column.name)).toContain('initial_position');
    await kit.database.query('DELETE FROM content_documents WHERE id=$1', [id]);
    expect((await kit.database.query('SELECT 1 FROM content_document_order')).rowCount).toBe(0);
  } finally {
    await kit?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
