import { expect, it } from 'vitest';
import { parseListQuery, updateListQuery } from '../list-query';

it('search and sorting reset pagination while preserving other URL state', () => {
  const original = new URLSearchParams('q=old&status=draft&page=3&pageSize=10');
  expect(updateListQuery(original, { q: 'new' })).toBe('/ui/lists?q=new&status=draft&pageSize=10');
  expect(updateListQuery(original, { sort: { key: 'title', direction: 'asc' } })).toBe(
    '/ui/lists?q=old&status=draft&pageSize=10&sort=title&order=asc',
  );
  expect(original.get('page')).toBe('3');
});

it('clear and filter actions remove obsolete query values', () => {
  const query = new URLSearchParams('q=old&status=draft&page=9&sort=title&order=desc');
  expect(updateListQuery(query, { q: '', status: 'all', sort: null })).toBe('/ui/lists');
  expect(updateListQuery(new URLSearchParams(), { page: 2, pageSize: 10 })).toBe(
    '/ui/lists?page=2&pageSize=10',
  );
});

it('malformed or unsafe pagination values cannot escape the local list bounds', () => {
  expect(parseListQuery(new URLSearchParams('page=1e3&pageSize=999&status=x&sort=x'))).toEqual({
    q: '',
    status: 'all',
    sort: null,
    page: 1,
    pageSize: 5,
  });
  expect(parseListQuery(new URLSearchParams('page=9007199254740992')).page).toBe(1);
  expect(parseListQuery(new URLSearchParams('page=-1')).page).toBe(1);
  expect(
    parseListQuery(
      new URLSearchParams('page=2&pageSize=10&status=published&sort=updatedAt&order=desc'),
    ),
  ).toMatchObject({
    page: 2,
    pageSize: 10,
    status: 'published',
    sort: { key: 'updatedAt', direction: 'desc' },
  });
});
