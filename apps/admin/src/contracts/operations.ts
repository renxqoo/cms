import { mediaOperations } from './media-operations';
import { queryOperations } from './query-operations';
import { documentOrderingOperations } from './document-order-operations';
import { segment, queryValue } from './operation-values';
import { defineOperation, type OperationDefinition } from './operation-definition';

const page = ['page', 'pageSize'] as const;
const list = [...page, 'q', 'sortBy', 'order'] as const;
const read = ['locale', 'fallback', 'mode', 'select', 'depth', 'joins'] as const;
const documents = [
  ...read,
  ...page,
  'q',
  'where',
  'sort',
  'trashed',
  'folderId',
  'context',
] as const;

export const operations = [
  ...documentOrderingOperations,
  ...mediaOperations,
  ...queryOperations(documents),
  defineOperation('identity.login', ['POST', '/v1/auth/login'], { access: 'public' }),
  defineOperation('identity.logout', ['POST', '/v1/auth/logout'], {
    bodyKind: 'none',
    responseKind: 'empty',
  }),
  defineOperation('identity.acceptInvitation', ['POST', '/v1/auth/invitation-acceptances'], {
    access: 'public',
    responseKind: 'empty',
  }),
  defineOperation('identity.requestPasswordReset', ['POST', '/v1/auth/password-reset-requests'], {
    access: 'public',
  }),
  defineOperation('identity.resetPassword', ['POST', '/v1/auth/password-resets'], {
    access: 'public',
    responseKind: 'empty',
  }),
  defineOperation('identity.changePassword', ['PUT', '/v1/me/password'], { responseKind: 'empty' }),
  defineOperation('credentials.list', ['GET', '/v1/me/credentials'], {
    queryKeys: [...page, 'kind'],
  }),
  defineOperation('credentials.createKey', ['POST', '/v1/me/api-keys']),
  defineOperation('credentials.revoke', ['DELETE', '/v1/me/credentials/:id'], {
    responseKind: 'empty',
  }),
  defineOperation('credentials.revokeClient', [
    'POST',
    '/v1/me/oauth-clients/:clientId/revocations',
  ]),
  defineOperation('credentials.getAuthorization', ['GET', '/v1/oauth/requests/:requestId']),
  defineOperation('credentials.decideAuthorization', [
    'POST',
    '/v1/oauth/requests/:requestId/decisions',
  ]),
  defineOperation('admins.list', ['GET', '/v1/admins'], {
    queryKeys: [...list, 'status', 'activation'],
  }),
  defineOperation('admins.get', ['GET', '/v1/admins/:id']),
  defineOperation('admins.create', ['POST', '/v1/admins'], { idempotency: 'required' }),
  defineOperation('admins.update', ['PATCH', '/v1/admins/:id']),
  defineOperation('admins.invite', ['POST', '/v1/admins/:id/invitations'], {
    idempotency: 'required',
  }),
  defineOperation('roles.list', ['GET', '/v1/roles'], { queryKeys: list }),
  defineOperation('roles.get', ['GET', '/v1/roles/:id']),
  defineOperation('roles.create', ['POST', '/v1/roles'], { idempotency: 'required' }),
  defineOperation('roles.update', ['PATCH', '/v1/roles/:id']),
  defineOperation('roles.replacePermissions', ['PUT', '/v1/roles/:id/permissions']),
  defineOperation('roles.delete', ['DELETE', '/v1/roles/:id'], {
    queryKeys: ['version'],
    responseKind: 'empty',
  }),
  defineOperation('permissions.list', ['GET', '/v1/permissions'], {
    queryKeys: [...list, 'status', 'scopeKind', 'collectionKey'],
  }),
  defineOperation('permissions.create', ['POST', '/v1/permissions'], { idempotency: 'required' }),
  defineOperation('permissions.update', ['PATCH', '/v1/permissions/:id']),
  defineOperation('permissions.delete', ['DELETE', '/v1/permissions/:id'], {
    queryKeys: ['version'],
    responseKind: 'empty',
  }),
  defineOperation('navigation.list', ['GET', '/v1/navigation']),
  defineOperation('navigation.create', ['POST', '/v1/navigation'], { idempotency: 'required' }),
  defineOperation('navigation.update', ['PATCH', '/v1/navigation/:id']),
  defineOperation('navigation.delete', ['DELETE', '/v1/navigation/:id'], {
    queryKeys: ['version'],
    responseKind: 'empty',
  }),
  defineOperation('endpoints.list', ['GET', '/v1/endpoints'], {
    queryKeys: [...page, 'module', 'accessKind'],
  }),
  defineOperation('endpoints.createBinding', ['POST', '/v1/endpoint-bindings'], {
    idempotency: 'required',
  }),
  defineOperation('endpoints.updateBinding', ['PATCH', '/v1/endpoint-bindings/:id']),
  defineOperation('endpoints.deleteBinding', ['DELETE', '/v1/endpoint-bindings/:id'], {
    queryKeys: ['version'],
    responseKind: 'empty',
  }),
  defineOperation('access.me', ['GET', '/v1/me']),
  defineOperation('access.readRecovery', ['GET', '/v1/security/recovery'], {
    queryKeys: [
      ...page,
      'resource',
      'operationId',
      'module',
      'scopeKind',
      'collectionKey',
      'id',
      'permissionId',
      'code',
      'status',
    ],
  }),
  defineOperation('access.updateOwnProfile', ['PATCH', '/v1/me']),
  defineOperation('access.myNavigation', ['GET', '/v1/me/navigation']),
  defineOperation('access.myOperations', ['GET', '/v1/me/operations'], { queryKeys: page }),
  defineOperation('audit.list', ['GET', '/v1/audit-logs'], {
    queryKeys: [...list, 'actorId', 'operationId', 'targetType', 'targetId', 'from', 'to'],
  }),
  defineOperation('collections.list', ['GET', '/v1/collections'], { queryKeys: ['locale'] }),
  defineOperation('resources.list', ['GET', '/v1/resources'], { queryKeys: documents }),
  defineOperation('collections.get', ['GET', '/v1/collections/:collection'], {
    queryKeys: ['locale'],
  }),
  defineOperation('collections.fieldOptions', [
    'POST',
    '/v1/collections/:collection/editor/options',
  ]),
  defineOperation('documents.getLock', ['GET', '/v1/collections/:collection/documents/:id/lock'], {
    queryKeys: ['editorId', 'locale'],
  }),
  defineOperation('documents.acquireLock', [
    'PUT',
    '/v1/collections/:collection/documents/:id/lock',
  ]),
  defineOperation(
    'documents.releaseLock',
    ['DELETE', '/v1/collections/:collection/documents/:id/lock'],
    { queryKeys: ['editorId', 'generation', 'locale'] },
  ),
  defineOperation('documents.unlock', [
    'POST',
    '/v1/collections/:collection/documents/:id/unlocks',
  ]),
  defineOperation(
    'documents.preview',
    ['GET', '/v1/collections/:collection/documents/:id/preview'],
    { queryKeys: ['locale'] },
  ),
  defineOperation('collections.editor', ['GET', '/v1/collections/:collection/editor'], {
    queryKeys: ['intent', 'id', 'locale', 'mode', 'fallback'],
  }),
  defineOperation('hierarchy.tree', ['GET', '/v1/collections/:collection/hierarchy'], {
    queryKeys: ['locale', 'mode', 'parentId', 'page', 'pageSize'],
  }),
  defineOperation('hierarchy.move', ['POST', '/v1/collections/:collection/hierarchy/moves'], {
    idempotency: 'required',
  }),
  defineOperation('collections.previewEditor', [
    'POST',
    '/v1/collections/:collection/editor/preview',
  ]),
  defineOperation('documents.list', ['GET', '/v1/collections/:collection/documents'], {
    queryKeys: documents,
  }),
  defineOperation('documents.create', ['POST', '/v1/collections/:collection/documents'], {
    idempotency: 'required',
  }),
  defineOperation('documents.validate', ['POST', '/v1/collections/:collection/validations']),
  defineOperation('documents.get', ['GET', '/v1/collections/:collection/documents/:id'], {
    queryKeys: read,
  }),
  defineOperation('documents.createPreviewTicket', [
    'POST',
    '/v1/collections/:collection/documents/:id/preview-tickets',
  ]),
  defineOperation('documents.revokePreviewTicket', [
    'DELETE',
    '/v1/collections/:collection/documents/:id/preview-tickets/:ticketId',
  ]),
  defineOperation(
    'languages.setDefault',
    ['POST', '/v1/collections/:collection/documents/:id/default-language'],
    { idempotency: 'required' },
  ),
  defineOperation('documents.update', ['PATCH', '/v1/collections/:collection/documents/:id']),
  defineOperation('documents.archive', ['DELETE', '/v1/collections/:collection/documents/:id'], {
    queryKeys: ['revision'],
  }),
  defineOperation(
    'documents.copyLocale',
    ['POST', '/v1/collections/:collection/documents/:id/locale-copies'],
    { idempotency: 'required' },
  ),
  defineOperation('documents.copy', ['POST', '/v1/collections/:collection/documents/:id/copies'], {
    idempotency: 'required',
  }),
  defineOperation(
    'documents.restoreTrash',
    ['POST', '/v1/collections/:collection/documents/:id/trash-restorations'],
    { idempotency: 'required' },
  ),
  defineOperation('documents.purge', ['POST', '/v1/collections/:collection/documents/:id/purges'], {
    idempotency: 'required',
  }),
  defineOperation(
    'documents.autosave',
    ['POST', '/v1/collections/:collection/documents/:id/autosaves'],
    {
      idempotency: 'required',
    },
  ),
  defineOperation(
    'documents.publish',
    ['POST', '/v1/collections/:collection/documents/:id/publications'],
    {
      idempotency: 'required',
    },
  ),
  defineOperation(
    'documents.unpublish',
    ['DELETE', '/v1/collections/:collection/documents/:id/publication'],
    { queryKeys: ['revision', 'locale'] },
  ),
  defineOperation('versions.list', ['GET', '/v1/collections/:collection/documents/:id/versions'], {
    queryKeys: [...page, 'locale'],
  }),
  defineOperation(
    'versions.get',
    ['GET', '/v1/collections/:collection/documents/:id/versions/:versionId'],
    { queryKeys: read },
  ),
  defineOperation(
    'versions.restore',
    ['POST', '/v1/collections/:collection/documents/:id/restorations'],
    {
      idempotency: 'required',
    },
  ),
  defineOperation(
    'versions.diff',
    ['GET', '/v1/collections/:collection/documents/:id/version-diff'],
    {
      queryKeys: ['from', 'to', 'locale'],
    },
  ),
  defineOperation(
    'content.schedulePublication',
    ['POST', '/v1/collections/:collection/documents/:id/publication-schedules'],
    { idempotency: 'required' },
  ),
  defineOperation(
    'content.cancelPublicationSchedule',
    ['DELETE', '/v1/collections/:collection/documents/:id/publication-schedules/:scheduleId'],
    { responseKind: 'empty', queryKeys: ['locale'] },
  ),
  defineOperation('content.batch', ['POST', '/v1/collections/:collection/batches'], {
    idempotency: 'required',
  }),
  defineOperation('content.listJobs', ['GET', '/v1/collections/:collection/jobs'], {
    queryKeys: [...page, 'action', 'status', 'documentId', 'locale'],
  }),
  defineOperation('content.getJob', ['GET', '/v1/collections/:collection/jobs/:jobId'], {
    queryKeys: ['locale'],
  }),
  defineOperation(
    'resources.references',
    ['GET', '/v1/collections/:collection/documents/:id/references'],
    {
      queryKeys: page,
    },
  ),
  defineOperation('folders.list', ['GET', '/v1/folders'], { queryKeys: ['collection'] }),
  defineOperation('folders.create', ['POST', '/v1/folders'], { idempotency: 'required' }),
  defineOperation('folders.update', ['PATCH', '/v1/folders/:id']),
  defineOperation('folders.delete', ['DELETE', '/v1/folders/:id'], {
    queryKeys: ['collection', 'version'],
    responseKind: 'empty',
  }),
  defineOperation('system.openapi', ['GET', '/openapi.json']),
  defineOperation('session.expire', ['POST', '/api/auth/expired-session'], {
    target: 'frontend',
    bodyKind: 'none',
    responseKind: 'empty',
  }),
] as const;

export type OperationId = (typeof operations)[number]['id'];

export function getOperation(id: OperationId): OperationDefinition {
  const value = operations.find((entry) => entry.id === id);
  if (!value) throw new Error('Unknown operation');
  return value;
}

export function acceptsIdempotencyKey(
  operation: OperationDefinition,
  key: string | undefined,
): boolean {
  if (operation.idempotency === 'none') return key === undefined;
  return key !== undefined && /^[\x20-\x7e]{16,128}$/.test(key);
}

export function operationPath(
  operation: OperationDefinition,
  params: Readonly<Record<string, string>> = {},
  query: Readonly<Record<string, unknown>> = {},
): string {
  const names = [...operation.path.matchAll(/:([a-zA-Z]+)/g)].map((match) => match[1] ?? '');
  if (
    Object.keys(params).length !== names.length ||
    names.some((name) => typeof params[name] !== 'string')
  )
    throw new Error('Invalid path parameters');
  const path = operation.path.replace(/:([a-zA-Z]+)/g, (_, name: string) =>
    segment(params[name] ?? ''),
  );
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!operation.queryKeys.includes(key)) throw new Error('Invalid query parameter');
    search.set(key, queryValue(key, value));
  }
  return `${path}${search.size > 0 ? `?${search}` : ''}`;
}

export function matchOperation(
  method: string,
  path: string,
): { operation: OperationDefinition; params: Record<string, string> } | null {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(path) || path.includes('..')) return null;
  const actual = path.split('/');
  for (const operation of operations) {
    if (operation.target !== 'backend') continue;
    if (operation.method !== method && !(method === 'HEAD' && operation.responseKind === 'stream'))
      continue;
    const template = operation.path.split('/');
    if (template.length !== actual.length) continue;
    const params: Record<string, string> = {};
    if (
      template.every((part, index) => {
        if (!part.startsWith(':')) return part === actual[index];
        if (!/^[a-zA-Z0-9_-]+$/.test(actual[index] ?? '')) return false;
        params[part.slice(1)] = actual[index] ?? '';
        return true;
      })
    )
      return { operation, params };
  }
  return null;
}
