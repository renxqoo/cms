import { randomUUID } from 'node:crypto';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { CollectionDefinition, ContentRegistry } from './definition.ts';

async function migrateLocalizedPage(
  tx: SqlExecutor,
  input: { collection: CollectionDefinition; pageSize: number; policy: CmsPolicy },
) {
  const selected = await tx.query<{ document_id: string }>(
    "SELECT document_id FROM content_publications WHERE collection_id=$1 AND locale='*' ORDER BY document_id LIMIT $2 FOR UPDATE",
    [input.collection.id, input.pageSize],
  );
  const ids = selected.rows.map((row) => row.document_id);
  if (ids.length === 0) return { processed: 0, complete: true };
  await tx.query(
    `WITH original AS (DELETE FROM content_publications WHERE document_id=ANY($1::uuid[]) AND locale='*' RETURNING document_id,collection_id,version_id) INSERT INTO content_publications(document_id,collection_id,locale,version_id) SELECT o.document_id,o.collection_id,l.locale,o.version_id FROM original o CROSS JOIN unnest($2::text[]) AS l(locale)`,
    [ids, input.collection.locales.supported],
  );
  await appendAudit(
    tx,
    {
      actorKind: 'system',
      operationId: 'content.localizePublications',
      targetType: 'collection',
      targetId: input.collection.id,
      requestId: randomUUID(),
      detail: { processed: ids.length, locales: input.collection.locales.supported },
    },
    input.policy,
  );
  return { processed: ids.length, complete: ids.length < input.pageSize };
}

export function createPublicationMigrator(options: {
  database: Database;
  registry: ContentRegistry;
  policy: CmsPolicy;
  resourceLockKey: number;
  maxPageSize: number;
}) {
  if (
    !Number.isSafeInteger(options.resourceLockKey) ||
    options.resourceLockKey === options.policy.securityLockKey ||
    !Number.isSafeInteger(options.maxPageSize) ||
    options.maxPageSize < 1
  )
    fail('invalid_input');
  return {
    migratePage(input: { collection: string; pageSize: number; signal?: AbortSignal }) {
      const collection = options.registry.get(input.collection);
      if (
        !Number.isSafeInteger(input.pageSize) ||
        input.pageSize < 1 ||
        input.pageSize > options.maxPageSize
      )
        fail('invalid_input');
      const signal = AbortSignal.any([
        AbortSignal.timeout(options.policy.requestTimeoutMs),
        ...(input.signal ? [input.signal] : []),
      ]);
      return securityTransaction(options.database, options.policy, {
        mode: 'exclusive',
        signal,
        async work(tx) {
          await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [options.resourceLockKey]);
          if (!collection.localizeStatus) {
            const incompatible = await tx.query(
              "SELECT 1 FROM content_publications WHERE collection_id=$1 AND locale<>'*' LIMIT 1",
              [collection.id],
            );
            if (incompatible.rowCount !== 0) fail('invalid_input');
            return { processed: 0, complete: true };
          }
          return migrateLocalizedPage(tx, {
            collection,
            pageSize: input.pageSize,
            policy: options.policy,
          });
        },
      });
    },
  };
}
