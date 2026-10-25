import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { assertRuntimePrivileges, grantRuntimePrivileges } from '@new-cms/database/privileges';
import { compileContent } from '@new-cms/cms/content/generate';
import { contentOperations } from '@new-cms/cms/content';
import { assetsOperations } from '@new-cms/cms/assets';
import { createTestRuntimeDatabase } from '../../../../../test/support/runtime-database.ts';
import { contentContext } from '../../../../../test/support/content-runtime.ts';
import { createRuntime } from '../../bootstrap/create-runtime.ts';
import type { ApplicationRuntime } from '../../bootstrap/create-runtime.ts';
import { loadConfig } from '../../bootstrap/load-config.ts';
import { applicationRegistry } from '../content-registry.ts';
import { applicationRuntimeProfile } from '../runtime-privileges.ts';

const resources: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const resource of resources.splice(0).toReversed()) await resource.close();
});
async function fixture() {
  const store = await createTestRuntimeDatabase();
  resources.push(store);
  const mapping = compileContent(applicationRegistry());
  const profile = applicationRuntimeProfile(mapping);
  await grantRuntimePrivileges(store.database, { roleName: store.roleName, profile });
  await assertRuntimePrivileges(store.runtime, profile);
  return { ...store, mapping, profile };
}

it('only permits exact generated tables and keeps their revision values immutable to UPDATE', async () => {
  const kit = await fixture();
  const [table] = kit.mapping.plan.tables;
  if (!table) throw new Error('Missing generated table');
  await expect(kit.runtime.query(`SELECT * FROM "${table.name}"`)).resolves.toMatchObject({
    rows: [],
  });
  const [column] = table.columns;
  if (!column) throw new Error('Missing generated column');
  await expect(
    kit.runtime.query(`UPDATE "${table.name}" SET "${column.name}"="${column.name}"`),
  ).rejects.toMatchObject({ code: '42501' });
  await kit.database.query('CREATE TABLE cf_unknown_expansion(id int)');
  await expect(assertRuntimePrivileges(kit.runtime, kit.profile)).resolves.toBeUndefined();
  await expect(kit.runtime.query('SELECT * FROM cf_unknown_expansion')).rejects.toMatchObject({
    code: '42501',
  });
  await kit.database.query(`GRANT SELECT(id) ON cf_unknown_expansion TO ${kit.roleName}`);
  await expect(assertRuntimePrivileges(kit.runtime, kit.profile)).rejects.toThrow(
    'Runtime table privileges are unsafe or incomplete',
  );
});

it('keeps schema control, versions, manifests and both backfill markers read-only including column grants', async () => {
  const kit = await fixture();
  for (const [table, column] of [
    ['content_schema_control', 'schema_version'],
    ['content_schema_versions', 'data_fingerprint'],
    ['content_schema_manifests', 'status'],
    ['content_schema_backfills', 'completed_at'],
    ['content_schema_document_backfills', 'revision'],
  ]) {
    await expect(kit.runtime.query(`SELECT * FROM ${table}`)).resolves.toBeDefined();
    for (const statement of [
      `UPDATE ${table} SET ${column}=${column}`,
      `DELETE FROM ${table}`,
      `INSERT INTO ${table} DEFAULT VALUES`,
      `TRUNCATE ${table}`,
    ])
      await expect(kit.runtime.query(statement)).rejects.toMatchObject({ code: '42501' });
    await kit.database.query(`GRANT UPDATE(${column}) ON ${table} TO ${kit.roleName}`);
    await expect(assertRuntimePrivileges(kit.runtime, kit.profile)).rejects.toThrow(
      'Runtime table privileges are unsafe or incomplete',
    );
    await grantRuntimePrivileges(kit.database, { roleName: kit.roleName, profile: kit.profile });
    await assertRuntimePrivileges(kit.runtime, kit.profile);
  }
});

it('rejects profile overrides, missing tables and malformed grants before changing the existing role', async () => {
  const kit = await fixture();
  const profiles = [
    [{ name: 'content_schema_control', privileges: ['UPDATE'] }],
    [{ name: 'cf_invalid;DROP TABLE roles', privileges: ['SELECT'] }],
    [{ name: 'cf_invalid', privileges: [] }],
    [{ name: 'cf_invalid', privileges: ['SELECT', 'SELECT'] }],
    [{ name: 'cf_invalid', privileges: ['TRUNCATE'] }],
    [
      { name: 'cf_invalid', privileges: ['SELECT'] },
      { name: 'cf_invalid', privileges: ['INSERT'] },
    ],
  ];
  for (const profile of profiles)
    await expect(
      Reflect.apply(grantRuntimePrivileges, undefined, [
        kit.database,
        { roleName: kit.roleName, profile },
      ]),
    ).rejects.toThrow('Invalid runtime privilege profile');
  await expect(
    assertRuntimePrivileges(kit.runtime, [
      { name: 'missing_generated_table', privileges: ['SELECT'] },
    ]),
  ).rejects.toThrow('Runtime database tables differ from the supported schema');
  await assertRuntimePrivileges(kit.runtime, kit.profile);
});

async function bindOperations(
  runtime: ApplicationRuntime,
  owner: ReturnType<typeof contentContext>,
) {
  for (const collection of ['articles', 'media'])
    for (const operation of [...contentOperations, ...assetsOperations].filter(
      (value) => value.scopeKind === 'collection',
    )) {
      const permission = await runtime.access.api.createPermission(
        { ...owner, idempotencyKey: randomUUID() },
        {
          code: `runtime:${collection}:${operation.id.replaceAll('.', '-').toLowerCase()}`,
          name: operation.id,
          scopeKind: 'collection',
          collectionKey: collection,
        },
      );
      await runtime.access.api.createBinding(
        { ...owner, idempotencyKey: randomUUID() },
        {
          operationId: operation.id,
          scopeKind: 'collection',
          collectionKey: collection,
          permissionId: permission.id,
        },
      );
    }
}

async function readyUpload(runtime: ApplicationRuntime, owner: ReturnType<typeof contentContext>) {
  const bytes = new TextEncoder().encode('%PDF-1.7\nprivate runtime bytes\n%%EOF');
  const upload = await runtime.assets.api.createUpload(
    { ...owner, idempotencyKey: randomUUID() },
    {
      collection: 'media',
      purpose: 'create',
      filename: 'runtime.pdf',
      mimeType: 'application/pdf',
      bytes: bytes.byteLength,
    },
  );
  await runtime.assets.api.writeUpload(
    { ...owner, idempotencyKey: randomUUID() },
    { collection: 'media', uploadId: upload.id },
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
  await runtime.assets.api.completeUpload(
    { ...owner, idempotencyKey: randomUUID() },
    { collection: 'media', uploadId: upload.id },
  );
  await runtime.assets.maintenance();
  const session = await runtime.assets.api.readUpload(owner, {
    collection: 'media',
    uploadId: upload.id,
  });
  expect(session.status).toBe('ready');
  return { uploadId: upload.id, bytes };
}

it('a restricted login role creates, publishes, archives and binds a privately downloadable media manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-role-assets-'));
  resources.push({ close: () => rm(root, { recursive: true, force: true }) });
  const kit = await fixture();
  const config = loadConfig({
    DATABASE_URL: kit.connectionString,
    DATABASE_SCHEMA: kit.schema,
    CMS_RATE_LIMIT_SECRET: 'isolated-runtime-role-transaction-secret',
    CMS_STORAGE_ROOT: root,
    NODE_ENV: 'test',
  });
  config.policy.userRateLimit = 10000;
  const publisher = createRuntime(config);
  resources.push(publisher);
  await publisher.access.reconcile();
  const password = 'An isolated runtime password 2026';
  await publisher.access.initializeAdmin({ email: 'runtime-owner@example.test', password });
  const runtime = createRuntime({
    ...config,
    database: { ...config.database, connectionString: kit.runtimeConnectionString },
  });
  resources.push(runtime);
  const session = await runtime.identity.api.login(contentContext(), {
    email: 'runtime-owner@example.test',
    password,
  });
  const owner = contentContext(session.token);
  await bindOperations(runtime, owner);
  const draft = await runtime.content.api.createDocument(
    { ...owner, idempotencyKey: randomUUID() },
    { collection: 'articles', data: { title: 'Runtime article', slug: 'runtime-article' } },
  );
  const published = await runtime.content.api.publishDocument(
    { ...owner, idempotencyKey: randomUUID() },
    { collection: 'articles', id: draft.id, revision: draft.revision },
  );
  expect(published.publishedVersionId).toBe(published.versionId);
  const archived = await runtime.content.api.archiveDocument(
    { ...owner, idempotencyKey: randomUUID() },
    { collection: 'articles', id: draft.id, revision: published.revision },
  );
  expect(archived.trashedAt).not.toBeNull();
  expect(archived.publishedVersionId).toBeNull();
  const upload = await readyUpload(runtime, owner);
  const media = await runtime.content.api.createDocument(
    { ...owner, idempotencyKey: randomUUID() },
    { collection: 'media', uploadId: upload.uploadId, data: { title: 'Private runtime media' } },
  );
  expect(media.file?.mimeType).toBe('application/pdf');
  const download = await runtime.assets.api.download(owner, { collection: 'media', id: media.id });
  expect(new Uint8Array(await new Response(download.stream).arrayBuffer())).toEqual(upload.bytes);
  await assertRuntimePrivileges(kit.runtime, kit.profile);
});
