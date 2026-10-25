export { parseContentSchemaSnapshot } from './collections/parse-snapshot.ts';
import { schemaSnapshot, schemaControlSql } from './collections/evolution.ts';
import { renderDrizzle, renderSql } from '@new-cms/database/codegen';
import type { ContentRegistry } from './definition.ts';
import { compileContent } from './adapters/postgres/compile-schema.ts';
import { generateTypes } from './collections/generate-types.ts';
import { generateDataSchemas } from './fields/data-schema.ts';

export { createRegistry, definitionFingerprint } from './collections/create-registry.ts';
export { generateEvolution } from './collections/evolution.ts';
export type { ContentEvolution } from './collections/evolution.ts';
export { compileContent } from './adapters/postgres/compile-schema.ts';
export { generateTypes } from './collections/generate-types.ts';
export { generateDataSchemas, generateCollectionSchema } from './fields/data-schema.ts';
export type * from './definition.ts';
export type * from './model.ts';
export function generateArtifacts(registry: ContentRegistry) {
  const mapping = compileContent(registry);
  const sql = `${renderSql(mapping.plan)}${schemaControlSql({ mapping, previous: { plan: { version: 1, tables: [] }, collections: [] }, backfills: [] })}`;
  return {
    mapping,
    snapshot: schemaSnapshot(mapping),
    sql,
    drizzle: renderDrizzle(mapping.plan),
    types: generateTypes(registry),
    schemas: generateDataSchemas(registry),
  };
}
