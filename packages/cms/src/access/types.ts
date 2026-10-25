import type { Account, IdentityParticipants } from '@new-cms/cms/identity/composition';
import type {
  CmsPolicy,
  OperationDefinition,
  RequestContext,
} from '@new-cms/cms/platform/contracts';
import type { accessInputSchemas } from './input-schemas.ts';
import type { Database, SqlExecutor } from '@new-cms/database/client';

export interface Resource {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Role extends Resource {
  code: string;
  name: string;
  description: string | null;
  status: 'active' | 'disabled';
  isSuper: boolean;
}

export interface RoleDetail extends Role {
  permissionIds: string[];
}

export interface RoleListItem extends Role {
  adminCount: number;
  permissionCount: number;
}

export interface Permission extends Resource {
  code: string;
  name: string;
  description: string | null;
  status: 'active' | 'disabled';
  scopeKind: 'global' | 'collection';
  collectionKey: string | null;
}

export interface NavigationNode extends Resource {
  parentId: string | null;
  type: 'group' | 'page' | 'action';
  name: string;
  path: string | null;
  icon: string | null;
  sortOrder: number;
  status: 'active' | 'disabled';
  visibility: 'container' | 'authenticated' | 'permission';
  permissionId: string | null;
}

export interface NavigationTree extends NavigationNode {
  children: NavigationTree[];
}

export interface VisibleNavigation {
  id: string;
  type: NavigationNode['type'];
  name: string;
  path: string | null;
  icon: string | null;
  children: VisibleNavigation[];
}

export interface Binding extends Resource {
  operationId: string;
  scopeKind: 'global' | 'collection';
  collectionKey: string | null;
  permissionId: string;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Admin extends Omit<Account, 'invitationDelivery'> {
  roleCode: string;
}

export interface AdminDetail extends Admin {
  invitationDelivery: Account['invitationDelivery'];
}

export interface Principal extends Admin {
  role: Role;
}

export interface AccessOptions {
  database: Database;
  policy: CmsPolicy;
  recoveryMaxResponseBytes: number;
  identity: IdentityParticipants;
  operations: readonly OperationDefinition[];
  collectionKeys: readonly string[];
  navigationPaths: readonly string[];
  navigationIcons: readonly string[];
}

export interface AccessRuntime extends AccessOptions {
  operationMap: ReadonlyMap<string, OperationDefinition>;
  schemas: ReturnType<typeof accessInputSchemas>;
}

export interface AuthorizedWork {
  tx: SqlExecutor;
  actor: Principal;
  ctx: RequestContext;
}
