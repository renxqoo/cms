import { randomUUID } from 'node:crypto';
import { createLocaleMapping } from './locale-source.ts';
import type { ContentOptions } from './types.ts';
import { z } from 'zod';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { ContentLimits, ContentRegistry } from './definition.ts';
import type { ContentMapping } from './model.ts';
import { createContentStore } from './adapters/postgres/store.ts';
import { compileContent } from './adapters/postgres/compile-schema.ts';
import { definitionFingerprint } from './collections/create-registry.ts';

export interface ContentSchemaMigratorOptions {
  database: Database;
  registry: ContentRegistry;
  mapping: ContentMapping;
  limits: ContentLimits;
  policy: CmsPolicy;
  resourceLockKey: number;
  resolveLocaleSource?: NonNullable<ContentOptions['resolveLocaleSource']>;
}
interface BackfillInput {
  collection: string;
  from: number;
  to: number;
  pageSize: number;
  cursor?: string;
  signal?: AbortSignal;
}
function executor(tx: SqlExecutor, maximum: number): SqlExecutor {
  let used = 0;
  return {
    query(text, values) {
      used += 1;
      if (used > maximum) fail('capacity_exceeded');
      return tx.query(text, values);
    },
  };
}
async function transaction<T>(
  options: ContentSchemaMigratorOptions,
  control: { mode: 'shared' | 'exclusive'; signal?: AbortSignal },
  work: (tx: SqlExecutor) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new CmsError('temporarily_unavailable')),
    options.policy.requestTimeoutMs,
  );
  timer.unref();
  const signal = control.signal
    ? AbortSignal.any([controller.signal, control.signal])
    : controller.signal;
  try {
    return await securityTransaction(options.database, options.policy, {
      mode: control.mode,
      signal,
      async work(tx) {
        const bounded = executor(tx, options.limits.maxSqlQueries);
        await bounded.query('SELECT pg_advisory_xact_lock($1::bigint)', [options.resourceLockKey]);
        return work(bounded);
      },
    });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
function backfillArguments(
  options: ContentSchemaMigratorOptions,
  input: Omit<BackfillInput, 'signal'>,
) {
  const version = z
    .number()
    .int()
    .positive()
    .max(2 ** 31 - 1);
  const parsed = z
    .strictObject({
      collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      from: version,
      to: version,
      pageSize: z.number().int().positive().max(options.limits.maxPageSize),
      cursor: z.uuid().optional(),
    })
    .safeParse(input);
  if (!parsed.success) fail('invalid_input');
  const value = parsed.data;
  if (value.from >= value.to || options.registry.get(value.collection).schemaVersion !== value.to)
    fail('invalid_input');
  options.mapping.get(value.collection, value.from);
  const { cursor, ...args } = value;
  return { ...args, ...(cursor ? { cursor } : {}) };
}
function audit(
  tx: SqlExecutor,
  options: ContentSchemaMigratorOptions,
  event: {
    operationId: string;
    targetId: string;
    detail: unknown;
  },
): Promise<void> {
  return appendAudit(
    tx,
    {
      actorKind: 'system',
      targetType: 'contentSchema',
      requestId: randomUUID(),
      ...event,
    },
    options.policy,
  );
}
export function createContentSchemaMigrator(options: ContentSchemaMigratorOptions) {
  assertConfiguration(options);
  const store = createContentStore({ mapping: options.mapping, limits: options.limits });
  const mappingFor = createLocaleMapping(options);
  return {
    async backfill(input: BackfillInput) {
      const { signal, ...raw } = input;
      const args = backfillArguments(options, raw);
      return transaction(options, { mode: 'shared', ...(signal ? { signal } : {}) }, async (tx) => {
        const scoped = createContentStore({
          mapping: await mappingFor(tx),
          limits: options.limits,
        });
        const result = await scoped.backfillSchema(tx, args);
        await audit(tx, options, {
          operationId: 'content.backfillSchema',
          targetId: options.registry.get(args.collection).id,
          detail: { from: args.from, to: args.to, ...result },
        });
        return result;
      });
    },
    activate(signal?: AbortSignal) {
      return transaction(
        options,
        { mode: 'exclusive', ...(signal ? { signal } : {}) },
        async (tx) => {
          const result = await store.activateSchema(tx);
          await audit(tx, options, {
            operationId: 'content.activateSchema',
            targetId: result.fingerprint,
            detail: { collections: result.collections },
          });
          return result;
        },
      );
    },
  };
}
function mappingDefinitions(mapping: ContentMapping): string {
  return definitionFingerprint(
    mapping.collections
      .map((collection) => collection.definition)
      .toSorted(
        (left, right) =>
          left.id.localeCompare(right.id) || left.schemaVersion - right.schemaVersion,
      ),
  );
}
function assertConfiguration(options: ContentSchemaMigratorOptions): void {
  if (
    !Number.isSafeInteger(options.resourceLockKey) ||
    options.resourceLockKey === options.policy.securityLockKey ||
    !Number.isSafeInteger(options.policy.requestTimeoutMs) ||
    options.policy.requestTimeoutMs <= 0 ||
    options.policy.requestTimeoutMs > 2 ** 31 - 1
  )
    fail('invalid_input');
  const expected = compileContent(options.registry);
  if (
    expected.fingerprint !== options.mapping.fingerprint ||
    definitionFingerprint(expected.plan) !== definitionFingerprint(options.mapping.plan) ||
    mappingDefinitions(expected) !== mappingDefinitions(options.mapping)
  )
    fail('invalid_input');
}
