import { createContentSchemaMigrator } from '@new-cms/cms/content/composition';
import type { ContentSchemaMigratorOptions } from '@new-cms/cms/content/composition';
import { executeSchemaCommand } from './schema-command.ts';

export async function migrateSchemaState(
  options: ContentSchemaMigratorOptions,
  control: {
    maxPages: number;
    pageSize: number;
    signal: AbortSignal;
    report(value: unknown): void;
  },
): Promise<void> {
  const migrator = createContentSchemaMigrator(options);
  for (const collection of options.registry.list) {
    const sources = options.mapping.collections
      .filter(
        ({ definition }) =>
          definition.id === collection.id && definition.schemaVersion < collection.schemaVersion,
      )
      .map(({ definition }) => definition.schemaVersion)
      .toSorted((left, right) => left - right);
    for (const from of sources) {
      const result = await executeSchemaCommand(
        migrator,
        {
          kind: 'backfill',
          collection: collection.key,
          from,
          to: collection.schemaVersion,
          pageSize: control.pageSize,
          maxPages: control.maxPages,
        },
        control,
      );
      if (!result.complete)
        throw new Error(
          'Schema migration page budget exhausted; resume content backfill before activation',
        );
    }
  }
  control.signal.throwIfAborted();
  control.report({ type: 'activated', ...(await migrator.activate(control.signal)) });
}
