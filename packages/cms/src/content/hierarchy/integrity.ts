import { createLocaleMapping } from '../locale-source.ts';
import type { ContentOptions } from '../types.ts';
import { randomUUID } from 'node:crypto';
import type { Database, SqlExecutor } from '@new-cms/database/client';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import type { ContentRegistry, ContentLimits, CollectionDefinition } from '../definition.ts';
import type { ContentMapping } from '../model.ts';
import { hierarchySettings } from '../collections/hierarchy-config.ts';
import { definitionFingerprint } from '../collections/create-registry.ts';
import { createContentStore } from '../adapters/postgres/store.ts';
import { compileContent } from '../adapters/postgres/compile-schema.ts';
import { parentReference } from './validation.ts';

export interface HierarchyIntegrityOptions extends Pick<ContentOptions, 'resolveLocaleSource'> {
  database: Database;
  registry: ContentRegistry;
  mapping: ContentMapping;
  limits: ContentLimits;
  policy: CmsPolicy;
  resourceLockKey: number;
  maxDepth: number;
}
interface Validation {
  collection: CollectionDefinition;
  epoch: string;
  token: string;
  configuration: string;
}
interface EpochRow {
  epoch: string;
  validated_epoch: string | null;
  configuration: string | null;
  validation_token: string | null;
  validating_configuration: string | null;
  validating_active: boolean | null;
}
type Store = ReturnType<typeof createContentStore>;

async function transaction<T>(
  options: HierarchyIntegrityOptions,
  input: { signal?: AbortSignal | undefined },
  work: (tx: SqlExecutor) => Promise<T>,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.policy.requestTimeoutMs);
  timeout.unref();
  const signal = input.signal
    ? AbortSignal.any([controller.signal, input.signal])
    : controller.signal;
  try {
    return await securityTransaction(options.database, options.policy, {
      mode: 'shared',
      signal,
      async work(tx) {
        let used = 0;
        const bounded: SqlExecutor = {
          query(sql, values) {
            if (++used > options.limits.maxSqlQueries) fail('capacity_exceeded');
            return tx.query(sql, values);
          },
        };
        await bounded.query('SELECT pg_advisory_xact_lock($1::bigint)', [options.resourceLockKey]);
        return work(bounded);
      },
    });
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function configuration(options: HierarchyIntegrityOptions, collection: CollectionDefinition) {
  return definitionFingerprint({
    behaviorHash: options.registry.behaviorHash,
    mapping: options.mapping.fingerprint,
    hierarchy: hierarchySettings(collection),
    locales: collection.locales,
    maxDepth: options.maxDepth,
  });
}

async function begin(
  options: HierarchyIntegrityOptions,
  input: {
    collection: CollectionDefinition;
    signal?: AbortSignal | undefined;
    store: Store;
    mappingFor: ReturnType<typeof createLocaleMapping>;
  },
): Promise<Validation | null> {
  return transaction(options, input, async (tx) => {
    await input.store.verifyReady(tx);
    await tx.query(
      'INSERT INTO content_hierarchy_validation(collection_id) VALUES($1) ON CONFLICT DO NOTHING',
      [input.collection.id],
    );
    const result = await tx.query<EpochRow>(
      'SELECT epoch::text,validated_epoch::text,configuration,validation_token,validating_configuration,validation_expires_at>clock_timestamp() AS validating_active FROM content_hierarchy_validation WHERE collection_id=$1 FOR UPDATE',
      [input.collection.id],
    );
    const [row] = result.rows;
    if (!row) fail('temporarily_unavailable');
    const collection = (await input.mappingFor(tx)).get(input.collection.key).definition;
    const signature = configuration(options, collection);
    if (row.epoch === row.validated_epoch && row.configuration === signature) return null;
    if (row.validation_token && row.validating_configuration === signature && row.validating_active)
      fail('temporarily_unavailable');
    const token = randomUUID();
    await tx.query(
      "UPDATE content_hierarchy_validation SET validation_token=$2,validating_configuration=$3,validation_expires_at=clock_timestamp()+$4*interval '1 millisecond' WHERE collection_id=$1",
      [input.collection.id, token, signature, options.policy.requestTimeoutMs],
    );
    return { collection, epoch: row.epoch, token, configuration: signature };
  });
}

async function requireEpoch(tx: SqlExecutor, input: Validation, leaseMs: number) {
  const result = await tx.query(
    "UPDATE content_hierarchy_validation SET validation_expires_at=clock_timestamp()+$5*interval '1 millisecond' WHERE collection_id=$1 AND epoch=$2::bigint AND validation_token=$3 AND validating_configuration=$4",
    [input.collection.id, input.epoch, input.token, input.configuration, leaseMs],
  );
  if (result.rowCount !== 1) fail('temporarily_unavailable');
}

async function inspectChain(
  tx: SqlExecutor,
  input: {
    options: HierarchyIntegrityOptions;
    store: Store;
    validation: Validation;
    id: string;
    locale: string;
    mode: 'editing' | 'published';
  },
) {
  const { collection } = input.validation;
  const settings = hierarchySettings(collection);
  if (!settings) return;
  const seen = new Set<string>();
  let current: string | null = input.id;
  while (current !== null) {
    if (seen.has(current)) fail('invalid_input');
    if (seen.size >= input.options.maxDepth) fail('capacity_exceeded');
    seen.add(current);
    const document = await input.store.readDocument(tx, {
      collection: collection.key,
      id: current,
      locale: input.locale,
    });
    if (document.trashedAt) fail('invalid_input');
    const versionId =
      input.mode === 'published' ? document.publishedVersionId : document.currentVersionId;
    if (!versionId) {
      if (current === input.id && input.mode === 'published') return;
      fail('invalid_input');
    }
    const data = await input.store.readRevisionData(tx, {
      collection: collection.key,
      documentId: current,
      versionId,
      locale: input.locale,
      fallback: [],
    });
    current = parentReference(data, {
      collection: collection.key,
      field: settings.parentFieldName,
    });
  }
}

async function verifyConfiguration(
  tx: SqlExecutor,
  input: {
    options: HierarchyIntegrityOptions;
    validation: Validation;
    store: Store;
    mappingFor: ReturnType<typeof createLocaleMapping>;
  },
) {
  await input.store.verifyReady(tx);
  const collection = (await input.mappingFor(tx)).get(input.validation.collection.key).definition;
  if (configuration(input.options, collection) !== input.validation.configuration)
    fail('temporarily_unavailable');
}

async function scan(
  options: HierarchyIntegrityOptions,
  input: {
    validation: Validation;
    store: Store;
    mappingFor: ReturnType<typeof createLocaleMapping>;
    signal?: AbortSignal | undefined;
  },
) {
  let cursor: string | undefined;
  let processed = 0;
  while (true) {
    const page = await transaction(options, input, async (tx) => {
      await requireEpoch(tx, input.validation, options.policy.requestTimeoutMs);
      await verifyConfiguration(tx, { ...input, options });
      return input.store.queryDocuments(tx, {
        collection: input.validation.collection.key,
        query: {
          page: 1,
          pageSize: options.limits.defaultPageSize,
          locale: input.validation.collection.locales.default,
          fallback: [],
          mode: 'editing',
          sort: [{ field: 'id', order: 'asc' }],
          select: [],
          ...(cursor ? { where: { field: 'id', operator: 'gt', value: cursor } as const } : {}),
        },
        limits: options.limits,
      });
    });
    if (page.rows.length === 0) return processed;
    for (const { document } of page.rows) {
      await inspectDocument(options, { ...input, id: document.id });
      processed += 1;
      cursor = document.id;
    }
  }
}

async function inspectDocument(
  options: HierarchyIntegrityOptions,
  input: Parameters<typeof scan>[1] & { id: string },
) {
  for (const locale of input.validation.collection.locales.supported) {
    for (const mode of ['editing', 'published'] as const)
      await transaction(options, input, async (tx) => {
        await requireEpoch(tx, input.validation, options.policy.requestTimeoutMs);
        await verifyConfiguration(tx, { ...input, options });
        await inspectChain(tx, {
          options,
          store: input.store,
          validation: input.validation,
          id: input.id,
          locale,
          mode,
        });
      });
  }
}

async function finish(
  options: HierarchyIntegrityOptions,
  input: {
    validation: Validation;
    store: Store;
    mappingFor: ReturnType<typeof createLocaleMapping>;
    signal?: AbortSignal | undefined;
  },
) {
  return transaction(options, input, async (tx) => {
    await verifyConfiguration(tx, { ...input, options });
    const { validation } = input;
    const result = await tx.query(
      'UPDATE content_hierarchy_validation SET validated_epoch=epoch,configuration=$4,validation_token=NULL,validating_configuration=NULL,validation_expires_at=NULL,validated_at=clock_timestamp() WHERE collection_id=$1 AND epoch=$2::bigint AND validation_token=$3 AND validating_configuration=$4',
      [validation.collection.id, validation.epoch, validation.token, validation.configuration],
    );
    if (result.rowCount !== 1) fail('temporarily_unavailable');
  });
}

export function createHierarchyIntegrityValidator(options: HierarchyIntegrityOptions) {
  const expected = compileContent(options.registry);
  if (
    expected.fingerprint !== options.mapping.fingerprint ||
    definitionFingerprint(expected.plan) !== definitionFingerprint(options.mapping.plan) ||
    definitionFingerprint(expected.collections.map((entry) => entry.definition)) !==
      definitionFingerprint(options.mapping.collections.map((entry) => entry.definition))
  )
    fail('invalid_input');
  if (
    !Number.isSafeInteger(options.resourceLockKey) ||
    options.resourceLockKey === options.policy.securityLockKey ||
    !Number.isSafeInteger(options.maxDepth) ||
    options.maxDepth < 1
  )
    fail('invalid_input');
  const mappingFor = createLocaleMapping(options);
  const store = createContentStore({
    mapping: options.mapping,
    limits: options.limits,
    mappingFor,
  });
  return {
    async validateAll(input: { signal?: AbortSignal } = {}) {
      const results = [];
      for (const collection of options.registry.list) {
        if (!hierarchySettings(collection)) continue;
        const validation = await begin(options, { collection, store, mappingFor, ...input });
        if (!validation) {
          results.push({ collection: collection.key, processed: 0, cached: true });
          continue;
        }
        const processed = await scan(options, { validation, store, mappingFor, ...input });
        await finish(options, { validation, store, mappingFor, ...input });
        results.push({ collection: collection.key, processed, cached: false });
      }
      return results;
    },
  };
}
