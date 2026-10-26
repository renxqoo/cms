import { randomUUID } from 'node:crypto';
import { createRuntime } from '../../apps/api/src/bootstrap/create-runtime.ts';
import type { ApplicationRuntime } from '../../apps/api/src/bootstrap/create-runtime.ts';
import { loadConfig } from '../../apps/api/src/bootstrap/load-config.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { collections } from '../../apps/api/src/config/collections/index.ts';
import { adminIcons, adminRoutes } from '../../apps/admin/src/config/admin-routes.ts';
import { createTestStorage } from './temporary-storage.ts';
import type { createCmsProcess } from './cms-process.ts';

async function seedBindings(runtime: ApplicationRuntime, context: () => RequestContext) {
  const scoped = runtime.operations.filter(
    (operation) => operation.scopeKind === 'collection' && operation.bindingConfigurable,
  );
  for (const collection of collections) {
    const permission = await runtime.access.api.createPermission(context(), {
      code: `browser:${collection.key}:manage`,
      name: `Manage ${collection.label}`,
      scopeKind: 'collection',
      collectionKey: collection.key,
    });
    for (const operation of scoped) {
      await runtime.access.api.createBinding(context(), {
        operationId: operation.id,
        scopeKind: 'collection',
        collectionKey: collection.key,
        permissionId: permission.id,
      });
    }
  }
}

async function seedNavigation(runtime: ApplicationRuntime, context: () => RequestContext) {
  const group = await runtime.access.api.createNavigation(context(), {
    type: 'group',
    name: '内容管理',
    visibility: 'container',
  });
  const routes = adminRoutes.filter((entry) =>
    ['collections', 'resources', 'jobs'].includes(entry.id),
  );
  for (const route of routes) {
    await runtime.access.api.createNavigation(context(), {
      type: 'page',
      parentId: group.id,
      name: route.label.zh,
      path: route.path,
      icon: route.icon,
      visibility: 'authenticated',
    });
  }
}

async function seedBlockedCleanup(cms: Awaited<ReturnType<typeof createCmsProcess>>) {
  const id = randomUUID();
  await cms.store.database.query(
    `INSERT INTO asset_objects(id,object_key,state,retain_until,write_deadline,
      cleanup_blocked,cleanup_attempts,cleanup_failure_code)
     VALUES($1,$2,'pending',clock_timestamp()+interval '1 day',
      clock_timestamp()-interval '1 second',true,1,'temporarily_unavailable')`,
    [id, `objects/${id}`],
  );
}

export async function seedAdminContent(cms: Awaited<ReturnType<typeof createCmsProcess>>) {
  const storage = await createTestStorage();
  let runtime: ApplicationRuntime | undefined;
  const context = () => ({
    requestId: randomUUID(),
    idempotencyKey: randomUUID(),
    ip: '127.0.0.1',
    token: cms.owner.token,
  });
  try {
    runtime = createRuntime(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: cms.store.runtimeConnectionString,
        DATABASE_SCHEMA: cms.store.schema,
        CMS_RATE_LIMIT_SECRET: 'isolated-admin-content-fixture-secret-2026',
        CMS_STORAGE_ROOT: storage.root,
        CMS_NAVIGATION_PATHS: adminRoutes.map((route) => route.path).join(','),
        CMS_NAVIGATION_ICONS: Object.keys(adminIcons).join(','),
      }),
    );
    await seedBindings(runtime, context);
    await seedNavigation(runtime, context);
    await seedBlockedCleanup(cms);
  } finally {
    try {
      await runtime?.close();
    } finally {
      await storage.close();
    }
  }
}
