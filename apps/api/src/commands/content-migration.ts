import { join } from 'node:path';
import { z } from 'zod';
import { generateEvolution, parseContentSchemaSnapshot } from '@new-cms/cms/content/generate';
import type { ContentRegistry, ContentSchemaSnapshot } from '@new-cms/cms/content/generate';

export function parseGenerationCommand(args: readonly string[]) {
  let check = false;
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--check' && !check) {
      check = true;
      continue;
    }
    if (name !== '--migration' && name !== '--reviewed-sql')
      throw new Error('Invalid generation arguments');
    const value = args[++index];
    if (value === undefined || value.startsWith('--') || name in values)
      throw new Error('Invalid generation arguments');
    values[name] = value;
  }
  const migration = values['--migration'];
  const reviewedPath = values['--reviewed-sql'];
  if (reviewedPath !== undefined && migration === undefined)
    throw new Error('Reviewed SQL requires --migration');
  return { check, migration, reviewedPath };
}

export const snapshotPath = 'packages/database/src/schema/generated/content-snapshot.json';
interface ArtifactSource {
  snapshot: ContentSchemaSnapshot;
  initialSql: string;
}
interface MigrationOptions {
  root: string;
  check: boolean;
  migration?: string;
  reviewedSql?: string;
  registry: ContentRegistry;
  generated: ArtifactSource;
  read(path: string): Promise<string | undefined>;
}
const recordSchema = z.strictObject({
  version: z.literal(1),
  previous: z.unknown(),
  next: z.unknown(),
  reviewedSql: z.string().min(1).optional(),
});
function snapshot(source: string): ContentSchemaSnapshot {
  return parseContentSchemaSnapshot(JSON.parse(source));
}
function migrationSql(
  options: MigrationOptions,
  previous: ContentSchemaSnapshot | null,
  reviewedSql: string | undefined,
): string {
  if (previous === null) {
    if (reviewedSql !== undefined)
      throw new Error('Initial generation does not accept reviewed SQL');
    return options.generated.initialSql;
  }
  const evolution = generateEvolution({
    previous,
    registry: options.registry,
    activateEmpty: true,
  });
  if (evolution.requiresManualMigration && reviewedSql === undefined)
    throw new Error(`Manual schema migration is required: ${evolution.manualReasons.join(', ')}`);
  if (!evolution.requiresMigration) throw new Error('No schema migration is required');
  if (
    reviewedSql !== undefined &&
    (!evolution.requiresManualMigration || reviewedSql.trim().length === 0)
  )
    throw new Error('Reviewed SQL requires a manual migration plan');
  return reviewedSql === undefined
    ? evolution.sql
    : `${evolution.sql}\n${reviewedSql}${reviewedSql.endsWith('\n') ? '' : '\n'}`;
}

function reviewedSource(options: MigrationOptions, record: string | undefined): string | undefined {
  if (record === undefined) return options.reviewedSql;
  const parsed = recordSchema.parse(JSON.parse(record));
  if (options.reviewedSql !== undefined && options.reviewedSql !== parsed.reviewedSql)
    throw new Error('Existing reviewed SQL cannot be overwritten');
  return parsed.reviewedSql;
}
async function previousSnapshot(
  options: MigrationOptions,
  sql: string | undefined,
  record: string | undefined,
) {
  if (record !== undefined) {
    const parsed = recordSchema.parse(JSON.parse(record));
    const next = parseContentSchemaSnapshot(parsed.next);
    if (JSON.stringify(next) !== JSON.stringify(options.generated.snapshot))
      throw new Error('Existing migration snapshot differs from current configuration');
    return parsed.previous === null ? null : parseContentSchemaSnapshot(parsed.previous);
  }
  if (sql !== undefined) {
    if (sql !== options.generated.initialSql)
      throw new Error('Existing migrations cannot be overwritten');
    return null;
  }
  const current = await options.read(join(options.root, snapshotPath));
  return current === undefined ? null : snapshot(current);
}
async function ensureNoUnreviewedMigration(options: MigrationOptions): Promise<void> {
  const current = await options.read(join(options.root, snapshotPath));
  if (current === undefined) {
    if (!options.check) throw new Error('Initial schema generation requires --migration');
    return;
  }
  const evolution = generateEvolution({
    previous: snapshot(current),
    registry: options.registry,
    activateEmpty: true,
  });
  if (evolution.requiresMigration || evolution.requiresManualMigration)
    throw new Error('Schema changes require a new reviewed --migration');
}
export async function contentMigration(options: MigrationOptions): Promise<Map<string, string>> {
  if (options.migration === undefined) {
    if (options.reviewedSql !== undefined) throw new Error('Reviewed SQL requires --migration');
    await ensureNoUnreviewedMigration(options);
    return new Map();
  }
  if (!/^\d+_[a-z0-9_]+\.sql$/.test(options.migration)) throw new Error('Invalid migration name');
  const path = `packages/database/migrations/${options.migration}`;
  const recordPath = path.replace(/\.sql$/, '.plan.json');
  const sql = await options.read(join(options.root, path));
  const record = await options.read(join(options.root, recordPath));
  const previous = await previousSnapshot(options, sql, record);
  const reviewedSql = reviewedSource(options, record);
  const nextSql = migrationSql(options, previous, reviewedSql);
  if (sql !== undefined && sql !== nextSql)
    throw new Error('Existing migrations cannot be overwritten');
  const nextRecord = `${JSON.stringify({ version: 1, previous, next: options.generated.snapshot, ...(reviewedSql === undefined ? {} : { reviewedSql }) }, null, 2)}\n`;
  if (record !== undefined && record !== nextRecord)
    throw new Error('Existing migration snapshots cannot be overwritten');
  return new Map([
    [recordPath, nextRecord],
    [path, nextSql],
  ]);
}
