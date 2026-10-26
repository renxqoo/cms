import { createDatabase } from '@new-cms/database/client';
import { migrate } from '@new-cms/database/migrate';
import { createAccessCatalog } from '@new-cms/cms/access/composition';
import { createPublicationMigrator } from '@new-cms/cms/content/composition';
import { contentConfiguration } from '../bootstrap/create-content.ts';
import { contentWorkPolicy } from '../config/content-policy.ts';
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
  try {
    await migrate(database);
    const content = contentConfiguration();
    const publicationMigrator = createPublicationMigrator({
      database, registry: content.registry, policy: config.policy,
      resourceLockKey: contentWorkPolicy().resourceLockKey,
      maxPageSize: content.limits.maxPageSize,
    });
    for (const collection of content.registry.list) {
      let complete = false;
      while (!complete) {
        const page = await publicationMigrator.migratePage({ collection: collection.key, pageSize: content.limits.maxPageSize });
        complete = page.complete;
      }
    }
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
    await database.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Migration failed; verify database configuration and migration compatibility.\n',
  );
  process.exitCode = 1;
});
