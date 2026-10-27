import { createDatabase } from '@new-cms/database/client';
import { migrate } from '@new-cms/database/migrate';
import { createAccessCatalog } from '@new-cms/cms/access/composition';
import {
  createPublicationMigrator,
  createContentLocaleResolver,
  createHierarchyIntegrityValidator,
} from '@new-cms/cms/content/composition';
import { contentConfiguration } from '../bootstrap/create-content.ts';
import { contentWorkPolicy, contentMigrationPolicy } from '../config/content-policy.ts';
import { migrateSchemaState } from './migrate-schema-state.ts';
import { loadContentMigrationConfig } from '../bootstrap/load-config.ts';
import { applicationOperations } from '../config/operations.ts';
import { initialCollectionPermissions } from '../config/access-defaults.ts';
import { collections } from '../config/collections/index.ts';

async function main(): Promise<void> {
  const config = loadContentMigrationConfig();
  const database = createDatabase({
    ...config.database,
    connectionTimeoutMs: 2000,
    lockTimeoutMs: 10000,
    statementTimeoutMs: 60000,
  });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    await migrate(database);
    await migrateContentState(database, config.policy, controller.signal);
    const catalog = createAccessCatalog({
      database,
      policy: config.policy,
      operations: applicationOperations,
      collectionKeys: collections.map((collection) => collection.key),
      initialCollectionPermissions: initialCollectionPermissions(),
    });
    await catalog.reconcile();
    await catalog.verifyReady();
    process.stdout.write('Database migrations and access catalog applied.\n');
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await database.close();
  }
}

async function migrateContentState(
  database: ReturnType<typeof createDatabase>,
  policy: ReturnType<typeof loadContentMigrationConfig>['policy'],
  signal: AbortSignal,
): Promise<void> {
  const content = contentConfiguration();
  const work = contentWorkPolicy();
  const options = {
    database,
    ...content,
    policy,
    resourceLockKey: work.resourceLockKey,
    resolveLocaleSource: createContentLocaleResolver(content),
  };
  const migration = contentMigrationPolicy();
  await migrateSchemaState(options, {
    maxPages: migration.maxPages,
    pageSize: migration.defaultPageSize,
    signal,
    report: (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
  });
  const publicationMigrator = createPublicationMigrator(options);
  for (const collection of content.registry.list) {
    let complete = false;
    for (let page = 0; page < migration.maxPages; page += 1) {
      signal.throwIfAborted();
      const result = await publicationMigrator.migratePage({
        collection: collection.key,
        pageSize: content.limits.maxPageSize,
        signal,
      });
      process.stdout.write(
        `${JSON.stringify({ type: 'publicationPage', collection: collection.key, ...result })}\n`,
      );
      if (result.complete) {
        complete = true;
        break;
      }
    }
    if (!complete)
      throw new Error('Publication migration page budget exhausted; rerun migration to resume');
  }
  const hierarchy = await createHierarchyIntegrityValidator({
    ...options,
    maxDepth: work.maxFolderDepth,
  }).validateAll({ signal });
  for (const result of hierarchy)
    process.stdout.write(`${JSON.stringify({ type: 'hierarchyValidated', ...result })}\n`);
}

void main().catch(() => {
  process.stderr.write(
    'Migration failed; verify database configuration and migration compatibility.\n',
  );
  process.exitCode = 1;
});
