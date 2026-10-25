export interface RequestContext {
  requestId: string;
  ip: string;
  token?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface CmsPolicy {
  sessionTtlMs: number;
  invitationTtlMs: number;
  resetTtlMs: number;
  invitationCooldownMs: number;
  resetCooldownMs: number;
  maxSessions: number;
  maxRoles: number;
  maxPermissions: number;
  maxNavigationNodes: number;
  maxRolePermissions: number;
  maxAuditBytes: number;
  maxPageSize: number;
  defaultPageSize: number;
  requestTimeoutMs: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  connectionTimeoutMs: number;
  securityLockKey: number;
  maintenanceLockKey: number;
  idempotencyTtlMs: number;
  rateWindowMs: number;
  ipRateLimit: number;
  userRateLimit: number;
  loginIpLimit: number;
  loginEmailIpLimit: number;
  resetIpLimit: number;
  invitationActorLimit: number;
  rateLimitSecret: string;
  passwordTimeoutMs: number;
  passwordConcurrency: number;
  passwordQueueLimit: number;
  passwordQueueTimeoutMs: number;
  smtpTimeoutMs: number;
  mailTaskTimeoutMs: number;
  mailConcurrency: number;
  cleanupIntervalMs: number;
  cleanupBatchSize: number;
  retentionMs: number;
  deliveryStaleMs: number;
}

export interface Scope {
  scopeKind: 'global' | 'collection';
  collectionKey: string | null;
}

export interface OperationDefinition {
  id: string;
  module: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  access: 'public' | 'authenticated' | 'security' | 'permission';
  scopeKind: Scope['scopeKind'];
  bindingConfigurable: boolean;
  defaultPermission?: string;
}

const errorStatuses = {
  invalid_input: 400,
  token_invalid: 400,
  invalid_scope: 400,
  invalid_credentials: 401,
  unauthenticated: 401,
  forbidden: 403,
  endpoint_unbound: 403,
  protected_resource: 403,
  not_found: 404,
  version_conflict: 409,
  identifier_taken: 409,
  resource_in_use: 409,
  binding_exists: 409,
  scope_mismatch: 409,
  last_super_admin: 409,
  capacity_exceeded: 409,
  idempotency_conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  temporarily_unavailable: 503,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof errorStatuses;

export interface ErrorDetails {
  retryAfterSeconds?: number;
  fieldErrors?: { field: string; message: string }[];
}

export class CmsError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;
  readonly fieldErrors: ErrorDetails['fieldErrors'];

  constructor(code: ErrorCode, details: ErrorDetails = {}) {
    super(code.replaceAll('_', ' '));
    this.name = 'CmsError';
    this.code = code;
    this.status = errorStatuses[code];
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.fieldErrors = details.fieldErrors;
  }
}

export function fail(code: ErrorCode, details?: ErrorDetails): never {
  throw new CmsError(code, details);
}
