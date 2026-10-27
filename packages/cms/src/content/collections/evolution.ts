import { dataFingerprint } from './data-fingerprint.ts';
import { renderEvolutionSql } from '@new-cms/database/codegen';
import type { PlanChange } from '@new-cms/database/codegen';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRegistry } from '../definition.ts';
import type { ContentMapping, ContentSchemaSnapshot, ContentSchemaBackfill } from '../model.ts';
import { compileContent } from '../adapters/postgres/compile-schema.ts';
export interface ContentEvolution {
  mapping: ContentMapping;
  snapshot: ContentSchemaSnapshot;
  changes: PlanChange[];
  sql: string;
  requiresMigration: boolean;
  requiresManualMigration: boolean;
  manualReasons: string[];
  requiresBackfill: boolean;
  backfills: ContentSchemaBackfill[];
}
export function schemaSnapshot(mapping: ContentMapping): ContentSchemaSnapshot {
  const collections = new Map(
    mapping.collections.map((collection) => [
      collection.definition.id,
      {
        id: collection.definition.id,
        key: collection.definition.key,
        schemaVersion: collection.definition.schemaVersion,
        dataFingerprint: dataFingerprint(collection.definition),
      },
    ]),
  );
  return {
    plan: mapping.plan,
    collections: [...collections.values()].toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
export function schemaControlSql(input: {
  mapping: ContentMapping;
  previous: ContentSchemaSnapshot;
  backfills: readonly ContentSchemaBackfill[];
  activateEmpty?: boolean;
}): string {
  const statements: string[] = [];
  for (const compiled of input.mapping.collections)
    statements.push(
      `SELECT cms_register_content_schema(${literal(compiled.definition.id)},${compiled.definition.schemaVersion},${literal(dataFingerprint(compiled.definition))});`,
    );
  const snapshot = schemaSnapshot(input.mapping);
  for (const collection of snapshot.collections) {
    const before = input.previous.collections.find((item) => item.id === collection.id);
    if (!before)
      statements.push(
        `INSERT INTO content_schema_control(collection_id,schema_version) VALUES(${literal(collection.id)},${collection.schemaVersion});`,
      );
    else if (before.schemaVersion !== collection.schemaVersion)
      statements.push(
        `UPDATE content_schema_control SET prepared_schema_version=${collection.schemaVersion},prepared_fingerprint=${literal(input.mapping.fingerprint)} WHERE collection_id=${literal(collection.id)} AND schema_version=${before.schemaVersion};`,
      );
  }
  const status = input.backfills.length > 0 ? 'preparing' : 'ready';
  statements.push(
    `INSERT INTO content_schema_manifests(fingerprint,plan,status) VALUES(${literal(input.mapping.fingerprint)},${literal(JSON.stringify(input.mapping.plan))}::jsonb,${literal(status)}) ON CONFLICT(fingerprint) DO NOTHING;`,
  );
  if (input.activateEmpty && input.backfills.length > 0)
    statements.push(emptySchemaActivationSql(input));
  return `${statements.join('\n')}\n`;
}

function emptySchemaActivationSql(input: {
  mapping: ContentMapping;
  backfills: readonly ContentSchemaBackfill[];
}): string {
  const collections = [
    ...new Map(
      input.mapping.collections.map((collection) => [collection.definition.id, collection]),
    ).values(),
  ];
  const changed = [
    ...new Set(
      input.backfills.map((backfill) => input.mapping.get(backfill.collection).definition.id),
    ),
  ];
  const ids = changed.map(literal).join(',');
  const targets = literal(
    JSON.stringify(
      collections.map(({ definition }) => ({
        collection_id: definition.id,
        schema_version: definition.schemaVersion,
      })),
    ),
  );
  const fingerprint = literal(input.mapping.fingerprint);
  return `DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM content_documents WHERE collection_id IN(${ids}))
       AND NOT EXISTS(SELECT 1 FROM content_revisions WHERE collection_id IN(${ids})) THEN
      UPDATE content_schema_control c SET schema_version=x.schema_version,prepared_schema_version=NULL,prepared_fingerprint=NULL FROM jsonb_to_recordset(${targets}::jsonb) x(collection_id text,schema_version integer) WHERE c.collection_id=x.collection_id AND (c.prepared_fingerprint=${fingerprint} OR c.schema_version=x.schema_version);
      UPDATE content_schema_manifests SET status='ready' WHERE fingerprint=${fingerprint} AND NOT EXISTS(SELECT 1 FROM jsonb_to_recordset(${targets}::jsonb) x(collection_id text,schema_version integer) LEFT JOIN content_schema_control c USING(collection_id) WHERE c.schema_version IS DISTINCT FROM x.schema_version);
    END IF;
  END $$;`;
}
export function generateEvolution(input: {
  previous: ContentSchemaSnapshot;
  registry: ContentRegistry;
  activateEmpty?: boolean;
}): ContentEvolution {
  const mapping = compileContent(input.registry);
  const snapshot = schemaSnapshot(mapping);
  const physical = renderEvolutionSql({ previous: input.previous.plan, next: mapping.plan });
  const transitions = collectionTransitions(input.previous, snapshot, input.registry);
  const { backfills } = transitions;
  const manualReasons = [...physical.manualReasons, ...transitions.manualReasons];
  const requiresMigration =
    physical.changes.length > 0 ||
    JSON.stringify(input.previous.collections) !== JSON.stringify(snapshot.collections);
  return {
    mapping,
    snapshot,
    changes: physical.changes,
    sql: `${physical.sql}${requiresMigration ? schemaControlSql({ mapping, previous: input.previous, backfills, activateEmpty: input.activateEmpty === true }) : ''}`,
    requiresMigration,
    requiresManualMigration: manualReasons.length > 0,
    manualReasons,
    requiresBackfill: backfills.length > 0,
    backfills,
  };
}

function collectionTransitions(
  previous: ContentSchemaSnapshot,
  snapshot: ContentSchemaSnapshot,
  registry: ContentRegistry,
) {
  const backfills: ContentSchemaBackfill[] = [];
  const manualReasons: string[] = [];
  for (const before of previous.collections) {
    const current = snapshot.collections.find((item) => item.id === before.id);
    if (!current) {
      manualReasons.push(`removeCollection:${before.key}`);
      continue;
    }
    if (current.key !== before.key)
      manualReasons.push(`collectionKeyMigrationRequired:${before.key}:${current.key}`);
    if (current.schemaVersion < before.schemaVersion) fail('invalid_input');
    if (current.schemaVersion === before.schemaVersion) {
      if (current.dataFingerprint !== before.dataFingerprint)
        manualReasons.push(`schemaVersionRequired:${current.key}`);
      continue;
    }
    const definition = registry.get(current.key);
    if (
      !definition.previousSchemas?.some((schema) => schema.schemaVersion === before.schemaVersion)
    ) {
      manualReasons.push(`missingDecoder:${current.key}:${before.schemaVersion}`);
      continue;
    }
    for (const schema of definition.previousSchemas)
      backfills.push({
        collection: current.key,
        from: schema.schemaVersion,
        to: current.schemaVersion,
      });
  }

  return { backfills, manualReasons };
}
