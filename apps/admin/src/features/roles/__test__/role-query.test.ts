import { expect, it } from 'vitest';
import { parseRoleQuery, roleQueryHref } from '../role-query';

it('uses bounded list defaults and does not forward unknown or roles status filters', () => {
  expect(
    parseRoleQuery(
      new URLSearchParams('page=-1&pageSize=101&sortBy=status&order=bad&status=disabled&secret=x'),
    ),
  ).toEqual({ page: 1, pageSize: 20, q: '', sortBy: 'createdAt', order: 'desc' });
  expect(
    parseRoleQuery(new URLSearchParams('page=3&pageSize=50&sortBy=name&order=asc&q=Editor')),
  ).toEqual({ page: 3, pageSize: 50, q: 'Editor', sortBy: 'name', order: 'asc' });
});

it('resets pages on searches and sorts while preserving an explicit page transition', () => {
  const first = roleQueryHref(new URLSearchParams('page=7&pageSize=50&status=disabled'), {
    q: 'Editor',
  });
  const search = new URL(first, 'http://localhost').searchParams;
  expect(search.get('page')).toBe('1');
  expect(search.get('pageSize')).toBe('50');
  expect(search.get('q')).toBe('Editor');
  expect(search.has('status')).toBe(false);
  const next = roleQueryHref(search, { page: 2 });
  expect(new URL(next, 'http://localhost').searchParams.get('page')).toBe('2');
  expect(parseRoleQuery(new URLSearchParams(`q=${'x'.repeat(200)}`)).q.length).toBe(128);
  expect(parseRoleQuery(new URLSearchParams('pageSize=10&sortBy=code')).sortBy).toBe('code');
});
