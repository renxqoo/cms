import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { AuthorizedManifest } from '../types.ts';
import { lockManifest } from './read-manifest.ts';
import { validateRename } from './filenames.ts';

export async function renameManifest(
  tx: SqlExecutor,
  input: { source: AuthorizedManifest; filename: string; retentionMs: number },
): Promise<string> {
  await lockManifest(tx, input.source.manifestId);
  const found = await tx.query<{ filename: string }>(
    'SELECT filename FROM asset_manifests WHERE id=$1',
    [input.source.manifestId],
  );
  const [row] = found.rows;
  if (!row) fail('not_found');
  validateRename(row.filename, input.filename);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO asset_manifests(id,filename,mime_type,bytes,digest,width,height,orientation,processor_version,recipe,state,retain_until)
     SELECT $2,$3,mime_type,bytes,digest,width,height,orientation,processor_version,recipe,'ready',clock_timestamp()+$4*interval '1 millisecond' FROM asset_manifests WHERE id=$1`,
    [input.source.manifestId, id, input.filename, input.retentionMs],
  );
  await tx.query(
    'INSERT INTO asset_manifest_objects(manifest_id,object_id,name,width,height) SELECT $2,object_id,name,width,height FROM asset_manifest_objects WHERE manifest_id=$1',
    [input.source.manifestId, id],
  );
  return id;
}
