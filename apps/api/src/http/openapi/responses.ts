import { contentResponseSchemas } from './content-schemas.ts';
import { assetResponseSchemas } from './assets-schemas.ts';
import { managementResponseSchemas } from './management-schemas.ts';
import { editorResponseSchemas } from './editor-schemas.ts';
import { discoveryResponseSchemas } from './discovery-schemas.ts';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { id, time, integer, text, object, reference, array, page } from './schema.ts';
import type { Schema } from './schema.ts';
const nullableTime = { anyOf: [time, { type: 'null' }] };
const nullableText = { type: ['string', 'null'] };
const state = { type: 'string', enum: ['active', 'disabled'] };
const base = { id, version: { type: 'integer', minimum: 1 }, createdAt: time, updatedAt: time };
const scope = {
  scopeKind: { type: 'string', enum: ['global', 'collection'] },
  collectionKey: nullableText,
};

function accountSchemas(): Record<string, Schema> {
  const account = {
    ...base,
    email: { type: 'string', format: 'email' },
    displayName: nullableText,
    roleId: id,
    roleCode: text,
    status: { type: 'string', enum: ['active', 'disabled', 'archived'] },
    activation: { type: 'string', enum: ['pending', 'activated'] },
    lastLoginAt: nullableTime,
  };
  return {
    Admin: object(account),
    AdminDetail: object({
      ...account,
      invitationDelivery: { anyOf: [reference('Delivery'), { type: 'null' }] },
    }),
    Delivery: object({
      id,
      status: { type: 'string', enum: ['pending', 'sending', 'accepted', 'failed', 'unknown'] },
      createdAt: time,
      finishedAt: nullableTime,
    }),
    DeliverySummary: object({
      id,
      status: { type: 'string', enum: ['pending', 'sending', 'accepted', 'failed', 'unknown'] },
    }),
    AccountCreated: object({
      admin: reference('Admin'),
      delivery: reference('DeliverySummary'),
    }),
    InvitationCreated: object({ adminId: id, delivery: reference('DeliverySummary') }),
    Me: object({
      ...account,
      role: object({ id, code: text, name: text, status: state, isSuper: { type: 'boolean' } }),
    }),
    Login: object({ token: text, tokenType: { const: 'Bearer' }, expiresAt: time }),
    ResetAccepted: object({ accepted: { const: true } }),
  };
}

function roleSchemas(): Record<string, Schema> {
  const role = {
    ...base,
    code: text,
    name: text,
    description: nullableText,
    status: state,
    isSuper: { type: 'boolean' },
  };
  return {
    Role: object(role),
    RoleDetail: object({ ...role, permissionIds: array(id) }),
    RoleListItem: object({ ...role, adminCount: integer, permissionCount: integer }),
    Permission: object({
      ...base,
      ...scope,
      code: text,
      name: text,
      description: nullableText,
      status: state,
    }),
    Binding: object({ ...base, ...scope, operationId: text, permissionId: id }),
  };
}

function navigationSchemas(): Record<string, Schema> {
  const node = {
    ...base,
    parentId: { anyOf: [id, { type: 'null' }] },
    type: { enum: ['group', 'page', 'action'] },
    name: text,
    path: nullableText,
    icon: nullableText,
    sortOrder: integer,
    status: state,
    visibility: { enum: ['container', 'authenticated', 'permission'] },
    permissionId: { anyOf: [id, { type: 'null' }] },
  };
  return {
    NavigationNode: object(node),
    NavigationTree: object({ ...node, children: array(reference('NavigationTree')) }),
    VisibleNavigation: object({
      id,
      type: node.type,
      name: text,
      path: nullableText,
      icon: nullableText,
      children: array(reference('VisibleNavigation')),
    }),
    Navigation: object({ rows: array(reference('NavigationTree')) }),
    MyNavigation: object({ rows: array(reference('VisibleNavigation')) }),
  };
}

function errorSchema() {
  return object({
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: text,
        message: text,
        requestId: text,
        fieldErrors: array(object({ field: text, message: text })),
      },
    },
  });
}

export function responseSchemas(): Record<string, Schema> {
  const result: Record<string, Schema> = {
    ...accountSchemas(),
    ...roleSchemas(),
    ...navigationSchemas(),
    ...contentResponseSchemas(),
    ...assetResponseSchemas(),
    ...managementResponseSchemas(),
    ...editorResponseSchemas(),
    ...discoveryResponseSchemas(),
    AllowedOperation: object({ operationId: text, ...scope }),
    Endpoint: object({
      operationId: text,
      module: text,
      method: text,
      path: text,
      accessKind: text,
      ...scope,
      bindingConfigurable: { type: 'boolean' },
      binding: { anyOf: [object({ id, permissionId: id, version: integer }), { type: 'null' }] },
    }),
    Audit: object({
      id,
      actorKind: { enum: ['system', 'admin'] },
      actorId: { anyOf: [id, { type: 'null' }] },
      operationId: text,
      targetType: text,
      targetId: nullableText,
      requestId: text,
      detail: { type: 'object' },
      createdAt: time,
    }),
    Error: errorSchema(),
  };
  for (const name of [
    'Admin',
    'RoleListItem',
    'Permission',
    'Endpoint',
    'AllowedOperation',
    'Audit',
  ])
    result[`${name}Page`] = page(name);
  return result;
}

const responses: Record<string, string> = {
  'identity.login': 'Login',
  'identity.requestPasswordReset': 'ResetAccepted',
  'admins.list': 'AdminPage',
  'admins.get': 'AdminDetail',
  'admins.create': 'AccountCreated',
  'admins.update': 'Admin',
  'admins.invite': 'InvitationCreated',
  'roles.list': 'RoleListItemPage',
  'roles.get': 'RoleDetail',
  'roles.create': 'RoleDetail',
  'roles.update': 'Role',
  'roles.replacePermissions': 'RoleDetail',
  'permissions.list': 'PermissionPage',
  'permissions.create': 'Permission',
  'permissions.update': 'Permission',
  'navigation.list': 'Navigation',
  'navigation.create': 'NavigationNode',
  'navigation.update': 'NavigationNode',
  'endpoints.list': 'EndpointPage',
  'endpoints.createBinding': 'Binding',
  'endpoints.updateBinding': 'Binding',
  'access.me': 'Me',
  'access.updateOwnProfile': 'Admin',
  'access.myNavigation': 'MyNavigation',
  'access.myOperations': 'AllowedOperationPage',
  'audit.list': 'AuditPage',
  'collections.list': 'ContentCollectionList',
  'collections.get': 'ContentCollection',
  'collections.editor': 'CollectionEditor',
  'documents.list': 'ContentDocumentPage',
  'documents.create': 'ContentDocument',
  'documents.get': 'ContentDocument',
  'documents.update': 'ContentDocument',
  'documents.archive': 'ContentDocument',
  'documents.copy': 'ContentDocument',
  'documents.purge': 'ContentPurge',
  'documents.restoreTrash': 'ContentDocument',
  'documents.autosave': 'ContentDocument',
  'documents.publish': 'ContentDocument',
  'documents.unpublish': 'ContentDocument',
  'versions.list': 'ContentVersionPage',
  'versions.get': 'ContentVersionDetail',
  'versions.restore': 'ContentDocument',
  'versions.diff': 'ContentVersionDiff',
  'content.schedulePublication': 'ContentJobAccepted',
  'content.batch': 'ContentBatchResult',
  'content.getJob': 'ContentJobResult',
  'content.listJobs': 'DiscoveredJobPage',
  'assets.listUploads': 'UploadSummaryPage',
  'folders.list': 'ContentFolderList',
  'folders.create': 'ContentFolder',
  'folders.update': 'ContentFolder',
  'resources.list': 'ContentDocumentPage',
  'resources.references': 'ContentReferencePage',
  'assets.createUpload': 'AssetUpload',
  'assets.writeUpload': 'AssetUploadWritten',
  'assets.completeUpload': 'AssetUpload',
  'assets.readUpload': 'AssetUpload',
  'assets.reprocess': 'AssetProcessingAccepted',
  'assets.listCleanup': 'AssetCleanupPage',
  'assets.getCleanup': 'AssetCleanup',
  'assets.retryCleanup': 'AssetCleanupRetry',
};

export function operationResponses(operation: OperationDefinition) {
  const name = responses[operation.id];
  const status = String(operation.successStatus ?? 200);
  const result: Record<string, unknown> = name
    ? {
        [status]: {
          description: 'Completed',
          content: { 'application/json': { schema: reference(name) } },
        },
      }
    : { '204': { description: 'Completed without a response body' } };
  if (operation.id === 'content.batch') result['202'] = result[status];
  if (operation.id === 'assets.download' || operation.id === 'assets.downloadBinding') {
    delete result['204'];
    result['200'] = {
      description: 'Private file stream',
      headers: {
        'Content-Type': { schema: { type: 'string' } },
        'Content-Length': { schema: { type: 'integer' } },
        ETag: { schema: { type: 'string' } },
      },
      content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
    };
  }
  for (const code of ['400', '401', '403', '404', '409', '413', '415', '429', '500', '503']) {
    result[code] = {
      description: 'Request failed',
      content: { 'application/json': { schema: reference('Error') } },
    };
  }
  return result;
}
