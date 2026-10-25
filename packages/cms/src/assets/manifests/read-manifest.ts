import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { ManifestSummary, ImageRecipe, ManifestObject } from '../types.ts';

interface ManifestRow {
  id: string;
  filename: string;
  mime_type: string;
  bytes: number;
  digest: string;
  width: number | null;
  height: number | null;
  orientation: number | null;
  processor_version: string;
  recipe: ImageRecipe;
}
interface ObjectRow extends ManifestObject {
  manifestId: string;
}

export async function readManifests(
  tx: SqlExecutor,
  input: { manifestIds: readonly string[] },
): Promise<Map<string, ManifestSummary>> {
  if (input.manifestIds.length === 0) return new Map();
  const rows = await tx.query<ManifestRow>(
    `SELECT *,bytes::float8 AS bytes FROM asset_manifests WHERE id=ANY($1::uuid[]) AND state='ready'`,
    [input.manifestIds],
  );
  const objects = await tx.query<ObjectRow>(
    `SELECT mo.manifest_id AS "manifestId",mo.name,o.bytes::float8 AS bytes,o.digest,o.mime_type AS "mimeType",mo.width,mo.height
     FROM asset_manifest_objects mo JOIN asset_objects o ON o.id=mo.object_id
     WHERE mo.manifest_id=ANY($1::uuid[]) AND o.state='ready' ORDER BY mo.name`,
    [input.manifestIds],
  );
  const grouped = new Map<string, ManifestObject[]>();
  for (const { manifestId, ...object } of objects.rows) {
    const list = grouped.get(manifestId) ?? [];
    list.push(object);
    grouped.set(manifestId, list);
  }
  return new Map(
    rows.rows.map((row) => [
      row.id,
      {
        id: row.id,
        filename: row.filename,
        mimeType: row.mime_type,
        bytes: row.bytes,
        digest: row.digest,
        width: row.width,
        height: row.height,
        orientation: row.orientation,
        processorVersion: row.processor_version,
        recipe: row.recipe,
        objects: grouped.get(row.id) ?? [],
      },
    ]),
  );
}

export async function readManifest(
  tx: SqlExecutor,
  input: { manifestId: string },
): Promise<ManifestSummary> {
  const manifests = await readManifests(tx, { manifestIds: [input.manifestId] });
  const manifest = manifests.get(input.manifestId);
  if (!manifest) fail('not_found');
  return manifest;
}

export async function lockManifest(tx: SqlExecutor, manifestId: string): Promise<void> {
  const result = await tx.query(
    "SELECT id FROM asset_manifests WHERE id=$1 AND state='ready' FOR UPDATE",
    [manifestId],
  );
  if (result.rowCount !== 1) fail('resource_in_use');
}
