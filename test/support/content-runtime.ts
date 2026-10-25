import { assetDiscoverySources } from '@new-cms/cms/assets/composition';
import { randomInt, randomUUID } from 'node:crypto';
import { createAccess } from '@new-cms/cms/access/composition';
import { accessOperations } from '@new-cms/cms/access';
import { createIdentity } from '@new-cms/cms/identity/composition';
import { identityOperations } from '@new-cms/cms/identity';
import { createContent } from '@new-cms/cms/content/composition';
import type { ContentOptions } from '@new-cms/cms/content/composition';
import type { MailMessage } from '@new-cms/cms/identity/composition';
import { assetsOperations } from '@new-cms/cms/assets';
import { contentOperations } from '@new-cms/cms/content';
import { createRegistry, generateArtifacts } from '@new-cms/cms/content/generate';
import type { CollectionDefinition } from '@new-cms/cms/content/generate';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createTestDatabase } from './database.ts';
import { createTestPolicy } from './policy.ts';
import { contentLimits } from './content.ts';

export const contentPassword = 'Collections fixture password';
export function contentContext(token?: string, idempotencyKey = randomUUID()): RequestContext {
  return { requestId: randomUUID(), ip: '127.0.0.1', idempotencyKey, ...(token ? { token } : {}) };
}

const locales = { default: 'en', supported: ['en', 'zh'], fallback: { zh: ['en'] } };
const workflowDefinitions: CollectionDefinition[] = [
  {
    id: 'workflow_articles',
    key: 'articles',
    schemaVersion: 1,
    label: 'Articles',
    mode: 'drafts',
    history: { maxVersions: 3, retentionMs: 0 },
    locales,
    search: ['title'],
    fields: [
      { id: 'title', name: 'title', type: 'text', required: true, localized: true },
      { id: 'slug', name: 'slug', type: 'text', unique: true },
      { id: 'score', name: 'score', type: 'number' },
      {
        id: 'related',
        name: 'related',
        type: 'relationship',
        relationTo: ['articles', 'pages'],
        hasMany: true,
      },
    ],
    defaultSort: [{ field: 'title', order: 'asc' }],
  },
  {
    id: 'workflow_pages',
    key: 'pages',
    schemaVersion: 1,
    label: 'Pages',
    mode: 'direct',
    history: { maxVersions: 3, retentionMs: 0 },
    locales,
    fields: [
      { id: 'title', name: 'title', type: 'text', required: true },
      { id: 'author', name: 'author', type: 'relationship', relationTo: ['articles'] },
    ],
  },
  {
    id: 'workflow_settings',
    key: 'settings',
    schemaVersion: 1,
    label: 'Settings',
    mode: 'direct',
    history: false,
    singleton: true,
    locales,
    fields: [{ id: 'title', name: 'title', type: 'text', required: true }],
  },
];
export function workflowCollections(): CollectionDefinition[] {
  return structuredClone(workflowDefinitions);
}

export function contentCollection(collections: readonly CollectionDefinition[], key: string) {
  const collection = collections.find((item) => item.key === key);
  if (!collection) throw new Error(`Missing fixture collection ${key}`);
  return collection;
}

export function contentField(collection: CollectionDefinition, name: string) {
  const field = collection.fields.find((item) => item.name === name);
  if (!field) throw new Error(`Missing fixture field ${name}`);
  return field;
}

export interface FixtureOptions {
  collections?: CollectionDefinition[];
  maxSyncBatchItems?: number;
  maxSqlQueries?: number;
  trashRetentionMs?: number;
  afterCommitHandlers?: ContentOptions['afterCommitHandlers'];
  compose?: (options: ContentOptions) => {
    content: ReturnType<typeof createContent>;
    options: ContentOptions;
    close(): Promise<void>;
  };
}

function fixtureServices(input: {
  database: ContentOptions['database'];
  policy: ContentOptions['policy'];
  registry: ContentOptions['registry'];
}) {
  const messages: MailMessage[] = [];
  const identity = createIdentity({
    database: input.database,
    policy: input.policy,
    passwords: {
      hash: (value) => Promise.resolve(`fixture:${value}`),
      verify: (value, hash) => Promise.resolve(hash === `fixture:${value}`),
      close: () => Promise.resolve(),
    },
    mailer: {
      send: (message) => {
        messages.push(message);
        return Promise.resolve('accepted');
      },
      close: () => Promise.resolve(),
    },
  });
  const access = createAccess({
    database: input.database,
    policy: input.policy,
    identity: identity.participants,
    operations: [
      ...identityOperations,
      ...accessOperations,
      ...contentOperations,
      ...assetsOperations,
    ],
    collectionKeys: input.registry.list.map((collection) => collection.key),
    navigationPaths: [],
    navigationIcons: [],
  });
  return { identity, access, messages };
}

async function initializeAccess(
  input: ReturnType<typeof fixtureServices> & { registry: ContentOptions['registry'] },
) {
  await input.access.reconcile();
  await input.access.initializeAdmin({
    email: 'content-owner@example.test',
    password: contentPassword,
  });
  const login = await input.identity.api.login(contentContext(), {
    email: 'content-owner@example.test',
    password: contentPassword,
  });
  const owner = () => contentContext(login.token);
  const permissionIds = new Map<string, string>();
  for (const collection of input.registry.list) {
    for (const operation of [...contentOperations, ...assetsOperations].filter(
      (item) => item.scopeKind === 'collection',
    )) {
      const permission = await input.access.api.createPermission(owner(), {
        code: `content:${collection.key}:${operation.id.replaceAll('.', '-').toLowerCase()}`,
        name: operation.id,
        scopeKind: 'collection',
        collectionKey: collection.key,
      });
      await input.access.api.createBinding(owner(), {
        operationId: operation.id,
        scopeKind: 'collection',
        collectionKey: collection.key,
        permissionId: permission.id,
      });
      permissionIds.set(`${collection.key}:${operation.id}`, permission.id);
    }
  }
  return { owner, permissionIds };
}

function fixtureContentOptions(
  input: {
    database: ContentOptions['database'];
    policy: ContentOptions['policy'];
    limits: ContentOptions['limits'];
    registry: ContentOptions['registry'];
    mapping: ContentOptions['mapping'];
    access: ReturnType<typeof createAccess>;
  },
  options: FixtureOptions,
): ContentOptions {
  return {
    database: input.database,
    policy: input.policy,
    limits: input.limits,
    registry: input.registry,
    mapping: input.mapping,
    authorize: input.access.authorize,
    authorizeActor: input.access.authorizeActor,
    workPolicy: {
      resourceLockKey: randomInt(1, 2_000_000_000),
      maxBatchItems: 1000,
      maxSyncBatchItems: options.maxSyncBatchItems ?? 20,
      jobBatchSize: 20,
      jobLeaseMs: 30000,
      jobMaxAttempts: 3,
      maxScheduleDelayMs: 86400000,
      trashRetentionMs: options.trashRetentionMs ?? 0,
      maxFolders: 100,
      maxFolderDepth: 8,
    },
    uploadPolicy: {
      maxBytes: 20971520,
      variantQuality: 80,
      variantFormat: 'webp',
      imageLimits: {
        maxOutputBytes: 20971520,
        maxPixels: 40000000,
        maxFrames: 1,
        maxWidth: 16384,
        maxHeight: 16384,
        maxVariants: 10,
      },
    },
    assetDiscoverySources,
    readAssetJob: () => Promise.reject(new CmsError('not_found')),
    afterCommitHandlers: options.afterCommitHandlers ?? {},
  };
}

function assembleFixture(contentOptions: ContentOptions, options: FixtureOptions) {
  return options.compose
    ? options.compose(contentOptions)
    : {
        content: createContent(contentOptions),
        options: contentOptions,
        close: () => Promise.resolve(),
      };
}

async function disposeFixture(tasks: readonly (() => Promise<unknown>)[]): Promise<void> {
  let failure: unknown;
  for (const task of tasks.toReversed()) {
    try {
      await task();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function fixtureResult(input: {
  kit: Awaited<ReturnType<typeof createTestDatabase>>;
  services: ReturnType<typeof fixtureServices>;
  authorization: Awaited<ReturnType<typeof initializeAccess>>;
  assembled: ReturnType<typeof assembleFixture>;
  registry: ContentOptions['registry'];
  artifacts: ReturnType<typeof generateArtifacts>;
  limits: ContentOptions['limits'];
  policy: ContentOptions['policy'];
  close(): Promise<void>;
}) {
  return {
    ...input.kit,
    ...input.services,
    ...input.authorization,
    contentOptions: input.assembled.options,
    content: input.assembled.content,
    registry: input.registry,
    artifacts: input.artifacts,
    limits: input.limits,
    policy: input.policy,
    close: () => input.close(),
  };
}

async function fixtureStorage(
  kit: Awaited<ReturnType<typeof createTestDatabase>>,
  options: FixtureOptions,
) {
  const policy = createTestPolicy({
    securityLockKey: randomInt(1, 2_000_000_000),
    userRateLimit: 10000,
  });
  const limits = contentLimits(
    options.maxSqlQueries ? { maxSqlQueries: options.maxSqlQueries } : {},
  );
  const registry = createRegistry({
    collections: options.collections ?? workflowCollections(),
    limits,
    operations: [...contentOperations, ...assetsOperations],
  });
  const artifacts = generateArtifacts(registry);
  await kit.database.query(artifacts.sql);
  return { policy, limits, registry, artifacts };
}

export async function createContentFixture(options: FixtureOptions = {}) {
  const kit = await createTestDatabase();
  const cleanup: (() => Promise<unknown>)[] = [kit.close];
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await disposeFixture(cleanup);
  };
  try {
    const { policy, limits, registry, artifacts } = await fixtureStorage(kit, options);
    const services = fixtureServices({ database: kit.database, policy, registry });
    cleanup.push(() => services.identity.close());
    const authorization = await initializeAccess({ ...services, registry });
    const contentOptions = fixtureContentOptions(
      {
        database: kit.database,
        policy,
        limits,
        registry,
        mapping: artifacts.mapping,
        access: services.access,
      },
      options,
    );
    const assembled = assembleFixture(contentOptions, options);
    cleanup.push(
      () => assembled.close(),
      () => assembled.content.close(),
    );
    return fixtureResult({
      kit,
      services,
      authorization,
      assembled,
      registry,
      artifacts,
      limits,
      policy,
      close,
    });
  } catch (error) {
    await close();
    throw error;
  }
}

export type ContentFixture = Awaited<ReturnType<typeof createContentFixture>>;
