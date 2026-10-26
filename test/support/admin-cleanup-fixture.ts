import { createDatabase } from '@new-cms/database/client';
import { z } from 'zod';

const connectionSchema = z.object({
  connectionString: z.url(),
  schema: z.string().regex(/^cms_test_[a-f0-9]{32}$/),
});
const connectionsSchema = z.array(connectionSchema).length(2);

export function cleanupFixtureConnection(
  project: string,
  encoded = process.env.CMS_ADMIN_E2E_DATABASES,
) {
  if (project !== 'development' && project !== 'production')
    throw new Error('Unknown browser realm.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded ?? 'null');
  } catch {
    throw new Error('Invalid browser fixture database configuration.');
  }
  const result = connectionsSchema.safeParse(parsed);
  if (!result.success) throw new Error('Invalid browser fixture database configuration.');
  const [development, production] = result.data;
  if (
    !development ||
    !production ||
    (development.connectionString === production.connectionString &&
      development.schema === production.schema)
  )
    throw new Error('Browser fixture database realms must be distinct.');
  return project === 'development' ? development : production;
}

interface CleanupFixtureTarget {
  project: string;
  id: string;
  visibleIds: readonly string[];
}
interface FixtureObjectRow {
  id: string;
  state: string;
  bytes: string | number;
  retain_until: Date;
  write_deadline: Date | null;
  cleanup_blocked: boolean;
  cleanup_attempts: number;
}

function targetConnection(input: CleanupFixtureTarget) {
  if (!z.uuid().safeParse(input.id).success || !input.visibleIds.includes(input.id))
    throw new Error(
      'Cleanup fixtures can address only an object exposed by the actual cleanup API.',
    );
  return cleanupFixtureConnection(input.project);
}

function objectState(row: FixtureObjectRow) {
  return {
    id: row.id,
    state: row.state,
    bytes: String(row.bytes),
    retainUntil: row.retain_until.toISOString(),
    writeDeadline: row.write_deadline?.toISOString() ?? null,
    blocked: row.cleanup_blocked,
    attempts: row.cleanup_attempts,
  };
}

export async function markHistoricalCleanupFailure(input: CleanupFixtureTarget) {
  const database = createDatabase({ ...targetConnection(input), maxConnections: 1 });
  try {
    const changed = await database.query<FixtureObjectRow>(
      "UPDATE asset_objects SET cleanup_blocked=true,cleanup_attempts=1 WHERE id=$1 AND NOT cleanup_blocked AND cleanup_attempts=0 AND state<>'deleted' RETURNING id,state,bytes,retain_until,write_deadline,cleanup_blocked,cleanup_attempts",
      [input.id],
    );
    if (changed.rowCount !== 1 || !changed.rows[0])
      throw new Error(
        'The selected browser realm must contain exactly one unchanged cleanup object.',
      );
    return objectState(changed.rows[0]);
  } finally {
    await database.close();
  }
}

export async function readCleanupFixtureObject(input: CleanupFixtureTarget) {
  const database = createDatabase({ ...targetConnection(input), maxConnections: 1 });
  try {
    const result = await database.query<FixtureObjectRow>(
      'SELECT id,state,bytes,retain_until,write_deadline,cleanup_blocked,cleanup_attempts FROM asset_objects WHERE id=$1',
      [input.id],
    );
    if (result.rows.length !== 1 || !result.rows[0])
      throw new Error('The cleanup object must belong to the selected browser realm.');
    return objectState(result.rows[0]);
  } finally {
    await database.close();
  }
}
