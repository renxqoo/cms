import { randomUUID, randomInt } from 'node:crypto';
import { afterEach } from 'vitest';
import { createIdentity } from '@new-cms/cms/identity/composition';
import type { MailMessage } from '@new-cms/cms/identity/composition';
import { identityOperations } from '@new-cms/cms/identity';
import { createAccess } from '@new-cms/cms/access/composition';
import { accessOperations } from '@new-cms/cms/access';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createAssets } from '../composition.ts';
import { assetsOperations } from '../operations.ts';
import type {
  AssetLimits,
  AssetsOptions,
  ImageProcessor,
  StorageDriver,
  ContentAuthorizer,
} from '../types.ts';

const fixtures: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of fixtures.splice(0).toReversed()) await close();
});
export function context(token?: string, key = randomUUID()): RequestContext {
  return {
    requestId: randomUUID(),
    ip: '127.0.0.1',
    idempotencyKey: key,
    ...(token ? { token } : {}),
  };
}
export const pdf = new TextEncoder().encode('%PDF-1.7\nprivate original bytes\n%%EOF');
export const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
export function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
export function memoryStorage(shared = false) {
  const objects = new Map<string, Uint8Array>();
  const driver: StorageDriver = {
    capabilities: {
      shared,
      directUpload: false,
      multipart: false,
      writeSettleMs: shared ? null : 0,
    },
    put(input) {
      input.signal.throwIfAborted();
      if (objects.has(input.key)) throw new Error('Immutable object exists');
      objects.set(input.key, input.bytes.slice());
      return Promise.resolve();
    },
    read(input) {
      input.signal.throwIfAborted();
      const value = objects.get(input.key);
      if (!value) throw new Error('Object missing');
      return Promise.resolve(stream(value));
    },
    remove(input) {
      input.signal.throwIfAborted();
      objects.delete(input.key);
      return Promise.resolve();
    },
    verify: () => Promise.resolve(),
    close: () => Promise.resolve(),
  };
  return { driver, objects };
}
export const limits: AssetLimits = {
  maxUploadBytes: 20971520,
  maxOutputBytes: 20971520,
  maxPixels: 40000000,
  maxFrames: 1,
  maxWidth: 8192,
  maxHeight: 8192,
  uploadConcurrency: 2,
  uploadQueueSize: 2,
  uploadQueueTimeoutMs: 1000,
  uploadTimeoutMs: 60000,
  processingTimeoutMs: 5000,
  sessionTtlMs: 1800000,
  retentionMs: 604800000,
  leaseMs: 30000,
  jobAttempts: 3,
  maintenanceBatchSize: 20,
  maxVariants: 10,
  maxActiveSessionsPerActor: 100,
  maxActiveBytesPerActor: 1073741824,
  maxActiveSessions: 10000,
  maxActiveBytes: 21474836480,
};

export async function createFixture(
  input: { storage?: StorageDriver; images?: ImageProcessor; limits?: Partial<AssetLimits> } = {},
) {
  const store = await createTestDatabase({ migrationScope: 'library' });
  const policy = createTestPolicy({ securityLockKey: randomInt(1, 2000000000) });
  const messages: MailMessage[] = [];
  const identity = createIdentity({
    database: store.database,
    policy,
    passwords: {
      hash: (value) => Promise.resolve(`test:${value}`),
      verify: (value, hash) => Promise.resolve(hash === `test:${value}`),
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
    database: store.database,
    policy,
    recoveryMaxResponseBytes: 2_097_152,
    identity: identity.participants,
    operations: [...identityOperations, ...accessOperations, ...assetsOperations],
    collectionKeys: ['media', 'articles'],
    navigationPaths: [],
    navigationIcons: [],
  });
  await access.reconcile();
  const admin = await access.initializeAdmin({
    email: 'assets-owner@example.test',
    password: 'A safe asset test password',
  });
  const login = await identity.api.login(context(), {
    email: admin.email,
    password: 'A safe asset test password',
  });
  const owner = context(login.token);
  const permission = await access.api.createPermission(context(login.token), {
    code: 'media:assets',
    name: 'Media assets',
    scopeKind: 'collection',
    collectionKey: 'media',
  });
  const bindings = [];
  for (const operation of assetsOperations.filter((item) => item.scopeKind === 'collection'))
    bindings.push(
      await access.api.createBinding(context(login.token), {
        operationId: operation.id,
        scopeKind: 'collection',
        collectionKey: 'media',
        permissionId: permission.id,
      }),
    );
  const memory = memoryStorage();
  let denied = false;
  const authorizeContent: ContentAuthorizer = async (tx, data) => {
    if (denied || data.collectionKey !== 'media') fail('forbidden');
    const upload = {
      maxBytes: input.limits?.maxUploadBytes ?? limits.maxUploadBytes,
      mimeTypes: ['application/pdf', 'image/png'],
      recipe: { variants: [] },
    };
    if (data.action === 'upload') return { upload, locale: data.locale ?? 'en' };
    const rows = await tx.query<{ id: string; revision: number; current_version_id: string }>(
      'SELECT * FROM content_documents WHERE id=$1 FOR UPDATE',
      [data.documentId],
    );
    const [document] = rows.rows;
    if (!document) fail('not_found');
    if (!data.reauthorizeOnly && data.revision !== undefined && data.revision !== document.revision)
      fail('version_conflict');
    const revisionId = data.versionId ?? document.current_version_id;
    const refs = await tx.query<{ manifest_id: string }>(
      "SELECT manifest_id FROM asset_references WHERE revision_id=$1 AND document_id=$2 AND ($3::uuid IS NULL OR id=$3) AND ($3::uuid IS NOT NULL OR source_path='$file')",
      [revisionId, document.id, data.bindingId ?? null],
    );
    return {
      upload,
      locale: data.locale ?? 'en',
      documentId: document.id,
      revision: document.revision,
      revisionId,
      ...(refs.rows[0] ? { manifestId: refs.rows[0].manifest_id } : {}),
    };
  };
  const options: AssetsOptions = {
    database: store.database,
    policy,
    resourceLockKey: randomInt(1, 2000000000),
    limits: { ...limits, ...input.limits },
    authorize: access.authorize,
    authorizeActor: access.authorizeActor,
    authorizeContent,
    storage: input.storage ?? memory.driver,
    images: input.images ?? {
      version: 'test-image-v1',
      process: () => Promise.resolve({ width: 1, height: 1, orientation: 1, variants: [] }),
      close: () => Promise.resolve(),
    },
    async commitProcessing(tx, data) {
      const revisionId = randomUUID();
      await tx.query(
        "INSERT INTO content_revisions(id,document_id,collection_id,revision,schema_version,kind,actor_id) VALUES($1,$2,'media',$3,1,'save',$4)",
        [revisionId, data.documentId, data.revision + 1, data.actor.id],
      );
      await assets.participants.bind(tx, {
        locale: data.locale ?? 'en',
        operationId: 'documents.create',
        actorId: data.actor.id,
        collectionKey: data.collectionKey,
        documentId: data.documentId,
        revisionId,
        sourcePath: '$file',
        expectedRevision: data.revision,
        uploadId: data.uploadId,
      });
      await tx.query('UPDATE content_documents SET revision=$2,current_version_id=$3 WHERE id=$1', [
        data.documentId,
        data.revision + 1,
        revisionId,
      ]);
      return { revisionId };
    },
  };
  const assets = createAssets(options);
  fixtures.push(async () => {
    await assets.close();
    await identity.close();
    await store.close();
  });
  async function revision(documentId = randomUUID(), revisionNumber = 1) {
    const revisionId = randomUUID();
    await store.database.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO content_documents(id,collection_id,revision) VALUES($1,'media',0) ON CONFLICT DO NOTHING",
        [documentId],
      );
      await tx.query(
        "INSERT INTO content_revisions(id,document_id,collection_id,revision,schema_version,kind,actor_id) VALUES($1,$2,'media',$3,1,'save',$4)",
        [revisionId, documentId, revisionNumber, admin.id],
      );
      await tx.query('UPDATE content_documents SET revision=$2,current_version_id=$3 WHERE id=$1', [
        documentId,
        revisionNumber,
        revisionId,
      ]);
    });
    return { documentId, revisionId };
  }
  return {
    ...store,
    assets,
    access,
    identity,
    messages,
    admin,
    owner,
    options,
    bindings,
    memory,
    revision,
    deny: () => {
      denied = true;
    },
  };
}
export type Fixture = Awaited<ReturnType<typeof createFixture>>;

export async function readyUpload(
  fixture: Fixture,
  bytes = pdf,
  input: { documentId?: string; revision?: number; mimeType?: string } = {},
) {
  const created = await fixture.assets.api.createUpload(context(fixture.owner.token), {
    collection: 'media',
    purpose: input.documentId ? 'replace' : 'create',
    filename: 'private-file.pdf',
    mimeType: input.mimeType ?? 'application/pdf',
    bytes: bytes.byteLength,
    ...input,
  });
  await fixture.assets.api.writeUpload(
    context(fixture.owner.token),
    { collection: 'media', uploadId: created.id },
    stream(bytes),
  );
  const processing = await fixture.assets.api.completeUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: created.id,
  });
  await fixture.assets.maintenance();
  const ready = await fixture.assets.api.readUpload(context(fixture.owner.token), {
    collection: 'media',
    uploadId: created.id,
  });
  if (ready.status !== 'ready' || !ready.manifest)
    throw new Error(`Upload did not become ready: ${ready.failureCode}`);
  return { ...ready, jobId: processing.jobId, manifest: ready.manifest };
}
