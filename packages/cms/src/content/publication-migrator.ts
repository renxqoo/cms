import { randomUUID } from 'node:crypto';
import { createLocaleMapping } from './locale-source.ts';
import type { ContentOptions } from './types.ts';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { CollectionDefinition, ContentLimits } from './definition.ts';
import type { ContentMapping } from './model.ts';
import { syncActiveProjections } from './adapters/postgres/active-projections.ts';
import { migratePublicationSlots } from './adapters/postgres/publication-slots.ts';
import { budgetedExecutor } from './runtime.ts';

interface PublicationMigrationOptions {
  database: Database;
  mapping: ContentMapping;
  limits: ContentLimits;
  policy: CmsPolicy;
  resourceLockKey: number;
  resolveLocaleSource?: NonNullable<ContentOptions['resolveLocaleSource']>;
}
interface MigrationInput {
  collection: string;
  pageSize: number;
  signal?: AbortSignal;
}

async function migratePublications(
  tx: SqlExecutor,
  options: PublicationMigrationOptions,
  input: { collection: CollectionDefinition; mappingFor: ReturnType<typeof createLocaleMapping> },
) {
  const { collection } = input;
  await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [options.resourceLockKey]);
  if (!collection.localizeStatus) {
    const incompatible = await tx.query(
      "SELECT 1 FROM content_publications WHERE collection_id=$1 AND locale<>'*' LIMIT 1",
      [collection.id],
    );
    if (incompatible.rowCount !== 0) fail('invalid_input');
  }
  const selected = await tx.query<{ document_id: string }>(
    "SELECT p.document_id FROM content_publications p WHERE p.collection_id=$1 AND (($2 AND p.locale='*') OR NOT $3=ANY(p.completed_schema_versions)) GROUP BY p.document_id ORDER BY p.document_id LIMIT 1",
    [collection.id, Boolean(collection.localizeStatus), collection.schemaVersion],
  );
  const ids = selected.rows.map((row) => row.document_id);
  if (ids.length === 0) return { processed: 0, complete: true };
  const mapping = await input.mappingFor(tx);
  const effective = mapping.get(collection.key).definition;
  for (const id of ids) {
    await migratePublicationSlots(tx, { collection: effective, id });
    await syncActiveProjections(tx, {
      mapping,
      limits: options.limits,
      collection: collection.key,
      id,
    });
  }
  await appendAudit(
    tx,
    {
      actorKind: 'system',
      operationId: 'content.localizePublications',
      targetType: 'collection',
      targetId: collection.id,
      requestId: randomUUID(),
      detail: { processed: ids.length, locales: effective.locales.supported },
    },
    options.policy,
  );
  return { processed: ids.length, complete: false };
}

export function createPublicationMigrator(options: PublicationMigrationOptions) {
  if (
    !Number.isSafeInteger(options.resourceLockKey) ||
    options.resourceLockKey === options.policy.securityLockKey ||
    !Number.isSafeInteger(options.limits.maxPageSize) ||
    options.limits.maxPageSize < 1 ||
    !Number.isSafeInteger(options.policy.requestTimeoutMs) ||
    options.policy.requestTimeoutMs < 1 ||
    options.policy.requestTimeoutMs > 2 ** 31 - 1
  )
    fail('invalid_input');
  const mappingFor = createLocaleMapping(options);
  return {
    migratePage(input: MigrationInput) {
      const collection = options.mapping.get(input.collection).definition;
      if (
        !Number.isSafeInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > options.limits.maxPageSize
      )
        fail('invalid_input');
      const signal = AbortSignal.any([
        AbortSignal.timeout(options.policy.requestTimeoutMs),
        ...(input.signal ? [input.signal] : []),
      ]);
      return securityTransaction(options.database, options.policy, {
        mode: 'exclusive',
        signal,
        work: (tx) =>
          migratePublications(budgetedExecutor(tx, options.limits.maxSqlQueries), options, {
            collection,
            mappingFor,
          }),
      });
    },
  };
}
