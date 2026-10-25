import { z } from 'zod';
import { parseRoleQuery } from '../roles/role-query';

const filtersSchema = z
  .object({
    actorId: z.uuid().optional(),
    operationId: z.string().max(128).optional(),
    targetType: z.string().max(64).optional(),
    targetId: z.string().max(160).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) <= Date.parse(value.to));
export type AuditFilters = z.infer<typeof filtersSchema>;
export interface AuditQuery extends AuditFilters {
  page: number;
  pageSize: number;
  q: string;
  sortBy: 'createdAt';
  order: 'asc' | 'desc';
}
const filterNames = ['actorId', 'operationId', 'targetType', 'targetId', 'from', 'to'] as const;

export function parseAuditQuery(search: URLSearchParams): AuditQuery {
  const list = parseRoleQuery(search);
  const parsed = filtersSchema.safeParse(
    Object.fromEntries(
      filterNames.filter((name) => search.get(name)).map((name) => [name, search.get(name)]),
    ),
  );
  return {
    page: list.page,
    pageSize: list.pageSize,
    q: list.q,
    sortBy: 'createdAt',
    order: list.order,
    ...(parsed.success ? parsed.data : {}),
  };
}

export function auditQueryHref(search: URLSearchParams, changes: Partial<AuditQuery>): string {
  const next = { ...parseAuditQuery(search), ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams({
    page: String(next.page),
    pageSize: String(next.pageSize),
    order: next.order,
  });
  if (next.q) query.set('q', next.q);
  for (const name of filterNames) if (next[name]) query.set(name, next[name]);
  return `/dashboard/audit-logs?${query}`;
}

export function auditFilterValues(form: FormData) {
  const values = Object.fromEntries(
    filterNames.filter((name) => form.get(name)).map((name) => [name, form.get(name)]),
  );
  for (const name of ['from', 'to'] as const) {
    const value = values[name];
    if (typeof value === 'string' && value) values[name] = `${value}:00.000Z`;
  }
  return filtersSchema.safeParse(values);
}

export function auditDate(value: Date, locale: 'zh' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(value);
}
