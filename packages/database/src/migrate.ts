import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Database, SqlExecutor } from './client.ts';

export interface MigrateOptions {
  directory?: string;
}

async function applyMigration(tx: SqlExecutor, directory: string, file: string): Promise<void> {
  const source = await readFile(join(directory, file), 'utf8');
  const hash = createHash('sha256').update(source).digest('hex');
  const existing = await tx.query<{ checksum: string }>(
    'SELECT checksum FROM cms_migrations WHERE name=$1',
    [file],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== hash) throw new Error('Applied migration checksum differs');
    return;
  }
  await tx.query(source);
  await tx.query('INSERT INTO cms_migrations(name,checksum) VALUES($1,$2)', [file, hash]);
}

export async function migrate(database: Database, options: MigrateOptions = {}): Promise<void> {
  const directory = options.directory ?? fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = (await readdir(directory))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .toSorted((left, right) => left.localeCompare(right));
  if (files.length === 0) throw new Error('No database migrations found');
  await database.transaction(async (tx) => {
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':cms-migrations',0))",
    );
    await tx.query(
      'CREATE TABLE IF NOT EXISTS cms_migrations(name text PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of files) await applyMigration(tx, directory, file);
  });
}
