import { createDatabase } from '@new-cms/database/client';
import {
  createContentSchemaMigrator,
  createContentLocaleResolver,
} from '@new-cms/cms/content/composition';
import { contentConfiguration } from '../bootstrap/create-content.ts';
import { loadContentMigrationConfig } from '../bootstrap/load-config.ts';
import { contentMigrationPolicy, contentWorkPolicy } from '../config/content-policy.ts';
import { executeSchemaCommand, parseSchemaCommand } from './schema-command.ts';

async function main(): Promise<void> {
  const command = parseSchemaCommand(process.argv.slice(2), contentMigrationPolicy());
  const configuration = contentConfiguration();
  const config = loadContentMigrationConfig();
  const database = createDatabase({
    ...config.database,
    statementTimeoutMs: config.policy.statementTimeoutMs,
    lockTimeoutMs: config.policy.lockTimeoutMs,
    connectionTimeoutMs: config.policy.connectionTimeoutMs,
  });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    const migrator = createContentSchemaMigrator({
      database,
      ...configuration,
      resolveLocaleSource: createContentLocaleResolver(configuration),
      policy: config.policy,
      resourceLockKey: contentWorkPolicy().resourceLockKey,
    });
    const result = await executeSchemaCommand(migrator, command, {
      signal: controller.signal,
      report: (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
    });
    if (!result.complete) process.exitCode = 2;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await database.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    'Content schema maintenance failed; verify migration state and configuration.\n',
  );
  process.exitCode = 1;
});
