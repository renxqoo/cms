import { z } from 'zod';
import type { Binding, NavigationNode, Permission, Role } from '../../types.ts';

export interface ResourceMap {
  roles: Role;
  permissions: Permission;
  navigation_nodes: NavigationNode;
  endpoint_bindings: Binding;
}
export type AccessTable = keyof ResourceMap;

export const resourceColumns = {
  roles: [
    'id',
    'code',
    'name',
    'description',
    'status',
    'isSuper',
    'version',
    'createdAt',
    'updatedAt',
  ],
  permissions: [
    'id',
    'code',
    'name',
    'description',
    'status',
    'scopeKind',
    'collectionKey',
    'version',
    'createdAt',
    'updatedAt',
  ],
  navigation_nodes: [
    'id',
    'parentId',
    'type',
    'name',
    'path',
    'icon',
    'sortOrder',
    'status',
    'visibility',
    'permissionId',
    'version',
    'createdAt',
    'updatedAt',
  ],
  endpoint_bindings: [
    'id',
    'operationId',
    'scopeKind',
    'collectionKey',
    'permissionId',
    'version',
    'createdAt',
    'updatedAt',
  ],
} satisfies Record<AccessTable, string[]>;

const base = {
  id: z.string(),
  version: z.number(),
  createdAt: z.date().transform((date) => date.toISOString()),
  updatedAt: z.date().transform((date) => date.toISOString()),
};
const status = z.enum(['active', 'disabled']);
const scope = { scopeKind: z.enum(['global', 'collection']), collectionKey: z.string().nullable() };
const schemas: { [K in AccessTable]: z.ZodType<ResourceMap[K]> } = {
  roles: z.object({
    ...base,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status,
    isSuper: z.boolean(),
  }),
  permissions: z.object({
    ...base,
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status,
    ...scope,
  }),
  navigation_nodes: z.object({
    ...base,
    parentId: z.string().nullable(),
    type: z.enum(['group', 'page', 'action']),
    name: z.string(),
    path: z.string().nullable(),
    icon: z.string().nullable(),
    sortOrder: z.number(),
    status,
    visibility: z.enum(['container', 'authenticated', 'permission']),
    permissionId: z.string().nullable(),
  }),
  endpoint_bindings: z.object({
    ...base,
    operationId: z.string(),
    permissionId: z.string(),
    ...scope,
  }),
};

export function projectResource<K extends AccessTable>(table: K, row: unknown): ResourceMap[K] {
  return schemas[table].parse(row);
}
