import { expect, it } from 'vitest';
import { createListQueryNavigation } from '../create-list-query-navigation';

it('a partial route commit cannot discard newer filter and sorting intentions', () => {
  const navigation = createListQueryNavigation('pageSize=5');
  const search = navigation.update({ q: 'media' });
  navigation.update({ status: 'draft' });
  navigation.observe(search.split('?')[1] ?? '');
  expect(navigation.update({ sort: { key: 'updatedAt', direction: 'desc' } })).toBe(
    '/ui/lists?pageSize=5&q=media&status=draft&sort=updatedAt&order=desc',
  );
  navigation.observe('pageSize=5&q=media&status=draft&sort=updatedAt&order=desc');
  expect(navigation.update({ page: 2 })).toBe(
    '/ui/lists?pageSize=5&q=media&status=draft&sort=updatedAt&order=desc&page=2',
  );
});

it('clearing the complete query remains the base of rapid subsequent filtering', () => {
  const navigation = createListQueryNavigation('q=old&page=2');
  expect(navigation.update({ q: '' })).toBe('/ui/lists');
  expect(navigation.update({ status: 'draft' })).toBe('/ui/lists?status=draft');
});

it('browser traversal discards pending intentions and uses the actual historical query', () => {
  const navigation = createListQueryNavigation('q=current&pageSize=10');
  navigation.update({ q: 'uncommitted' });
  navigation.traverse('q=historical&pageSize=5');
  navigation.observe('q=historical&pageSize=5');
  expect(navigation.update({ status: 'published' })).toBe(
    '/ui/lists?q=historical&pageSize=5&status=published',
  );
});

it('external navigation replaces pending intentions without inventing browser history', () => {
  const navigation = createListQueryNavigation('q=first');
  navigation.update({ q: 'pending' });
  navigation.observe('q=external&status=published');
  expect(navigation.update({ pageSize: 20, page: 1 })).toBe(
    '/ui/lists?q=external&status=published&page=1&pageSize=20',
  );
});

it('reobserving the current route does not erase events awaiting their first commit', () => {
  const navigation = createListQueryNavigation('pageSize=5');
  navigation.update({ q: 'pending' });
  navigation.observe('pageSize=5');
  expect(navigation.update({ status: 'draft' })).toBe(
    '/ui/lists?pageSize=5&q=pending&status=draft',
  );
});
