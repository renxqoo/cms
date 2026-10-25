export interface AuditEvent {
  actorKind: 'admin' | 'system';
  actorId?: string | null;
  operationId: string;
  targetType: string;
  targetId?: string | null;
  requestId: string;
  detail?: unknown;
}

export interface AuditQuery {
  page: number;
  pageSize: number;
  q?: string;
  order?: 'asc' | 'desc';
  actorId?: string;
  operationId?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
}

export interface AuditRow {
  id: string;
  actorKind: 'admin' | 'system';
  actorId: string | null;
  operationId: string;
  targetType: string;
  targetId: string | null;
  requestId: string;
  detail: unknown;
  createdAt: string;
}

export interface AuditList {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}
