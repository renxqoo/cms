import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { timestamps, version } from './columns.ts';

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    description: varchar('description', { length: 512 }),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    isSuper: boolean('is_super').notNull().default(false),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    check('roles_code_check', sql`${t.code} ~ '^[a-z][a-z0-9_-]{0,63}$'`),
    check('roles_name_check', sql`length(btrim(${t.name})) > 0`),
    check('roles_status_check', sql`${t.status} IN ('active','disabled')`),
    check('roles_version_check', sql`${t.version}>0`),
    check(
      'roles_super_shape',
      sql`(${t.isSuper} AND ${t.code}='super_admin' AND ${t.status}='active') OR (NOT ${t.isSuper} AND ${t.code}<>'super_admin')`,
    ),
    uniqueIndex('roles_one_super')
      .on(t.isSuper)
      .where(sql`${t.isSuper}`),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey(),
    code: varchar('code', { length: 160 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    description: varchar('description', { length: 512 }),
    scopeKind: varchar('scope_kind', { length: 16 }).notNull(),
    collectionKey: varchar('collection_key', { length: 64 }),
    scopeRef: text('scope_ref')
      .notNull()
      .generatedAlwaysAs(
        sql`CASE WHEN scope_kind='global' THEN 'global' ELSE 'collection:' || collection_key END`,
      ),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    check('permissions_code_check', sql`${t.code} ~ '^[a-z][a-z0-9_-]*(:[a-z][a-z0-9_-]*){1,3}$'`),
    check('permissions_name_check', sql`length(btrim(${t.name}))>0`),
    check('permissions_scope_kind_check', sql`${t.scopeKind} IN ('global','collection')`),
    check(
      'permissions_scope_check',
      sql`(${t.scopeKind}='global' AND ${t.collectionKey} IS NULL) OR (${t.scopeKind}='collection' AND ${t.collectionKey} ~ '^[a-z][a-z0-9_-]{0,63}$')`,
    ),
    check('permissions_status_check', sql`${t.status} IN ('active','disabled')`),
    check('permissions_version_check', sql`${t.version}>0`),
    unique().on(t.id, t.scopeRef),
    index('permissions_scope_idx').on(t.scopeKind, t.collectionKey),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index('role_permissions_permission_idx').on(t.permissionId),
  ],
);

export const navigationNodes = pgTable(
  'navigation_nodes',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => navigationNodes.id, {
      onDelete: 'restrict',
    }),
    type: varchar('type', { length: 16 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    path: varchar('path', { length: 255 }),
    icon: varchar('icon', { length: 64 }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: varchar('status', { length: 16 }).notNull().default('active'),
    visibility: varchar('visibility', { length: 16 }).notNull(),
    permissionId: uuid('permission_id').references(() => permissions.id, { onDelete: 'restrict' }),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    check('navigation_type_check', sql`${t.type} IN ('group','page','action')`),
    check('navigation_name_check', sql`length(btrim(${t.name}))>0`),
    check('navigation_status_check', sql`${t.status} IN ('active','disabled')`),
    check(
      'navigation_visibility_check',
      sql`${t.visibility} IN ('container','authenticated','permission')`,
    ),
    check('navigation_parent_check', sql`${t.parentId} IS NULL OR ${t.parentId}<>${t.id}`),
    check(
      'navigation_permission_check',
      sql`(${t.visibility}='permission' AND ${t.permissionId} IS NOT NULL) OR (${t.visibility}<>'permission' AND ${t.permissionId} IS NULL)`,
    ),
    check(
      'navigation_shape_check',
      sql`(${t.type}='group' AND ${t.parentId} IS NULL AND ${t.path} IS NULL AND ${t.visibility}='container') OR (${t.type}='page' AND ${t.parentId} IS NOT NULL AND ${t.path} IS NOT NULL AND ${t.visibility} IN ('authenticated','permission')) OR (${t.type}='action' AND ${t.parentId} IS NOT NULL AND ${t.path} IS NULL AND ${t.icon} IS NULL AND ${t.visibility} IN ('authenticated','permission'))`,
    ),
    check('navigation_version_check', sql`${t.version}>0`),
    index('navigation_parent_idx').on(t.parentId, t.sortOrder, t.id),
    index('navigation_permission_idx').on(t.permissionId),
  ],
);

export const operationCatalog = pgTable(
  'operation_catalog',
  {
    operationId: varchar('operation_id', { length: 128 }).primaryKey(),
    module: varchar('module', { length: 32 }).notNull(),
    method: varchar('method', { length: 8 }).notNull(),
    path: varchar('path', { length: 255 }).notNull(),
    accessKind: varchar('access_kind', { length: 16 }).notNull(),
    scopeKind: varchar('scope_kind', { length: 16 }).notNull(),
    bindingConfigurable: boolean('binding_configurable').notNull(),
    description: varchar('description', { length: 512 }),
    ...timestamps(),
  },
  (t) => [
    check('operation_method_check', sql`${t.method} IN ('GET','POST','PUT','PATCH','DELETE')`),
    check(
      'operation_access_check',
      sql`${t.accessKind} IN ('public','authenticated','security','permission')`,
    ),
    check('operation_scope_check', sql`${t.scopeKind} IN ('global','collection')`),
    check(
      'operation_configurable_check',
      sql`NOT ${t.bindingConfigurable} OR ${t.accessKind}='permission'`,
    ),
    unique().on(t.operationId, t.scopeKind),
  ],
);

export const endpointBindings = pgTable(
  'endpoint_bindings',
  {
    id: uuid('id').primaryKey(),
    operationId: varchar('operation_id', { length: 128 }).notNull(),
    scopeKind: varchar('scope_kind', { length: 16 }).notNull(),
    collectionKey: varchar('collection_key', { length: 64 }),
    scopeRef: text('scope_ref')
      .notNull()
      .generatedAlwaysAs(
        sql`CASE WHEN scope_kind='global' THEN 'global' ELSE 'collection:' || collection_key END`,
      ),
    permissionId: uuid('permission_id').notNull(),
    version: version(),
    ...timestamps(),
  },
  (t) => [
    check('endpoint_scope_kind_check', sql`${t.scopeKind} IN ('global','collection')`),
    check(
      'endpoint_scope_check',
      sql`(${t.scopeKind}='global' AND ${t.collectionKey} IS NULL) OR (${t.scopeKind}='collection' AND ${t.collectionKey} ~ '^[a-z][a-z0-9_-]{0,63}$')`,
    ),
    check('endpoint_version_check', sql`${t.version}>0`),
    foreignKey({
      columns: [t.operationId, t.scopeKind],
      foreignColumns: [operationCatalog.operationId, operationCatalog.scopeKind],
    }).onDelete('restrict'),
    foreignKey({
      columns: [t.permissionId, t.scopeRef],
      foreignColumns: [permissions.id, permissions.scopeRef],
    }).onDelete('restrict'),
    uniqueIndex('endpoint_bindings_global_uq')
      .on(t.operationId)
      .where(sql`${t.scopeKind}='global'`),
    uniqueIndex('endpoint_bindings_collection_uq')
      .on(t.operationId, t.collectionKey)
      .where(sql`${t.scopeKind}='collection'`),
    index('endpoint_bindings_permission_idx').on(t.permissionId),
  ],
);
