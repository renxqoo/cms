import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestStorage } from '../../../../../test/support/temporary-storage.ts';
import { runCommand } from '../../../../../test/support/process.ts';
import { createRuntime } from '../../bootstrap/create-runtime.ts';
import { loadConfig } from '../../bootstrap/load-config.ts';

const migrate = fileURLToPath(new URL('../migrate.ts', import.meta.url));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).toReversed()) await close();
});

async function fixture() {
  const store = await createTestDatabase();
  cleanups.push(store.close);
  const storage = await createTestStorage();
  cleanups.push(storage.close);
  const env = {
    ...process.env,
    DATABASE_URL: store.connectionString,
    CMS_MIGRATION_DATABASE_URL: store.connectionString,
    DATABASE_SCHEMA: store.schema,
    CMS_RATE_LIMIT_SECRET: 'isolated-initial-migration-access-secret',
    CMS_STORAGE_ROOT: storage.root,
    NODE_ENV: 'test',
  };
  const runtime = createRuntime(loadConfig(env));
  cleanups.push(() => runtime.close());
  async function owner() {
    const password = 'Isolated migration owner 2026';
    await runtime.access.initializeAdmin({ email: 'migration-owner@example.test', password });
    const login = await runtime.identity.api.login(
      { requestId: randomUUID(), ip: '127.0.0.1' },
      { email: 'migration-owner@example.test', password },
    );
    return () => ({
      requestId: randomUUID(),
      idempotencyKey: randomUUID(),
      ip: '127.0.0.1',
      token: login.token,
    });
  }
  return { runtime, env, owner };
}

it('regression: database migration alone makes all initial collections editable without manual permission bindings', async () => {
  const kit = await fixture();
  runCommand(process.execPath, migrate, { env: kit.env });
  await kit.runtime.access.verifyReady();
  const owner = await kit.owner();
  const catalog = await kit.runtime.content.api.listCollections(owner(), {});
  expect(catalog.rows.map((row) => row.key).toSorted()).toEqual([
    'articles',
    'developers',
    'documents',
    'home',
    'languages',
    'media',
    'message-bundles',
    'models',
    'pages',
    'settings',
    'site',
    'tags',
  ]);
  for (const collection of [
    'articles',
    'media',
    'pages',
    'settings',
    'models',
    'developers',
    'documents',
    'site',
    'home',
    'languages',
    'message-bundles',
    'tags',
  ]) {
    const editor = await kit.runtime.content.api.getEditor(owner(), {
      collection,
      intent: 'create',
    });
    expect(
      editor.actions.find((action) => action.operationId === 'documents.create')?.state,
    ).not.toBe('denied');
  }
  const created = await kit.runtime.content.api.createDocument(owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'First article', slug: 'first-article' },
  });
  expect(created.data).toMatchObject({ title: 'First article', slug: 'first-article' });
});

it('preserves deliberately removed bindings and disabled permissions when migrations run again', async () => {
  const kit = await fixture();
  runCommand(process.execPath, migrate, { env: kit.env });
  const owner = await kit.owner();
  const binding = await initialArticleBinding(kit.runtime, owner());
  await kit.runtime.access.api.deleteBinding(owner(), {
    id: binding.id,
    version: binding.version,
  });
  const permissions = await kit.runtime.access.api.listPermissions(owner(), {
    collectionKey: 'media',
  });
  const [permission] = permissions.rows;
  if (!permission) throw new Error('Initial media permission missing');
  await kit.runtime.access.api.updatePermission(owner(), {
    id: permission.id,
    version: permission.version,
    name: 'Custom media policy',
    status: 'disabled',
  });
  runCommand(process.execPath, migrate, { env: kit.env });
  await expect(
    kit.runtime.content.api.createDocument(owner(), { collection: 'articles', data: {} }),
  ).rejects.toMatchObject({ code: 'endpoint_unbound' });
  expect(
    (await kit.runtime.access.api.listPermissions(owner(), { collectionKey: 'media' })).rows[0],
  ).toMatchObject({ name: 'Custom media policy', status: 'disabled' });
});

it('does not add default collection permissions to an existing catalog during an upgrade', async () => {
  const kit = await fixture();
  await kit.runtime.access.reconcile();
  const owner = await kit.owner();
  runCommand(process.execPath, migrate, { env: kit.env });
  expect((await kit.runtime.content.api.listCollections(owner(), {})).rows).toEqual([]);
});

async function initialArticleBinding(
  runtime: ReturnType<typeof createRuntime>,
  context: RequestContext,
) {
  for (let page = 1; ; page++) {
    const endpoints = await runtime.access.api.listEndpoints(context, {
      module: 'content',
      page,
      pageSize: 100,
    });
    const endpoint = endpoints.rows.find(
      (row) => row.operationId === 'documents.create' && row.collectionKey === 'articles',
    );
    if (endpoint?.binding) return endpoint.binding;
    if (page * 100 >= endpoints.total) throw new Error('Initial article binding missing');
  }
}
