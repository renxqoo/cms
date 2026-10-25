interface Schema {
  [key: string]: unknown;
}

const id = { type: 'string', format: 'uuid' };
const time = { type: 'string', format: 'date-time' };
const nullableTime = { anyOf: [time, { type: 'null' }] };
const nullableText = { type: ['string', 'null'] };
const text = { type: 'string' };
const integer = { type: 'integer' };
const state = { type: 'string', enum: ['active', 'disabled'] };
const base = { id, version: { type: 'integer', minimum: 1 }, createdAt: time, updatedAt: time };
const scope = {
  scopeKind: { type: 'string', enum: ['global', 'collection'] },
  collectionKey: nullableText,
};

function object(properties: Record<string, Schema>): Schema {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function reference(name: string): Schema {
  return { $ref: `#/components/schemas/${name}` };
}
function array(items: Schema): Schema {
  return { type: 'array', items };
}
function page(name: string): Schema {
  return object({ rows: array(reference(name)), total: integer, page: integer, pageSize: integer });
}

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
};

export function operationResponses(idValue: string, method: string) {
  const name = responses[idValue];
  let status = method === 'POST' ? '201' : '200';
  if (idValue === 'identity.login') status = '200';
  if (idValue === 'identity.requestPasswordReset') status = '202';
  const result: Record<string, unknown> = name
    ? {
        [status]: {
          description: 'Completed',
          content: { 'application/json': { schema: reference(name) } },
        },
      }
    : { '204': { description: 'Completed without a response body' } };
  for (const code of ['400', '401', '403', '404', '409', '413', '415', '429', '500', '503']) {
    result[code] = {
      description: 'Request failed',
      content: { 'application/json': { schema: reference('Error') } },
    };
  }
  return result;
}
