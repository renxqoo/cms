import { expect, it } from 'vitest';
import { auditDate, auditFilterValues, auditQueryHref, parseAuditQuery } from '../audit-query';

it('parses only supported audit filters and fixes sorting to creation time', () => {
  const query = parseAuditQuery(
    new URLSearchParams(
      'actorId=66666666-6666-4666-8666-666666666666&operationId=roles.update&targetType=role&targetId=abc&from=2026-10-01T00:00:00.000Z&to=2026-10-26T01:00:00.000Z&page=2&pageSize=50&q=review&sortBy=name&order=asc',
    ),
  );
  expect(query).toEqual({
    page: 2,
    pageSize: 50,
    q: 'review',
    sortBy: 'createdAt',
    order: 'asc',
    actorId: '66666666-6666-4666-8666-666666666666',
    operationId: 'roles.update',
    targetType: 'role',
    targetId: 'abc',
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-10-26T01:00:00.000Z',
  });
  const href = auditQueryHref(new URLSearchParams('page=2&targetType=role&unknown=bad'), {
    q: 'new search',
    from: '2026-10-01T00:00:00.000Z',
  });
  expect(href).toBe(
    '/dashboard/audit-logs?page=1&pageSize=20&order=desc&q=new+search&targetType=role&from=2026-10-01T00%3A00%3A00.000Z',
  );
});

it('rejects invalid IDs and reverse UTC ranges without forwarding unvalidated filters', () => {
  expect(parseAuditQuery(new URLSearchParams('actorId=wrong&targetType=role'))).not.toHaveProperty(
    'actorId',
  );
  expect(
    parseAuditQuery(
      new URLSearchParams('from=2026-10-26T00:00:00.000Z&to=2026-10-01T00:00:00.000Z'),
    ),
  ).not.toHaveProperty('from');
  const form = new FormData();
  form.set('from', '2026-10-26T12:00');
  form.set('to', '2026-10-26T11:00');
  expect(auditFilterValues(form).success).toBe(false);
  form.set('to', '2026-10-26T12:00');
  expect(auditFilterValues(form)).toMatchObject({
    success: true,
    data: { from: '2026-10-26T12:00:00.000Z', to: '2026-10-26T12:00:00.000Z' },
  });
});

it('keeps rendering dates in UTC in both supported languages', () => {
  const date = new Date('2026-10-26T22:30:00.000Z');
  expect(auditDate(date, 'en')).toContain('10:30');
  expect(auditDate(date, 'zh')).toContain('22:30');
});
