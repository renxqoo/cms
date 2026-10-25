import { expect, it, vi } from 'vitest';
import { createQueryNavigation } from '../query-controller';

function build(path: string) {
  return (search: URLSearchParams, changes: { q?: string; status?: string }) => {
    for (const [name, value] of Object.entries(changes)) search.set(name, value);
    return `${path}?${search}`;
  };
}

it('uses the current route builder instead of retaining an old dynamic collection path', () => {
  const navigation = createQueryNavigation('pageSize=10');
  expect(navigation.update({ q: 'saved' }, build('/dashboard/roles'))).toBe(
    '/dashboard/roles?pageSize=10&q=saved',
  );
  expect(navigation.update({ status: 'draft' }, build('/dashboard/collections/articles'))).toBe(
    '/dashboard/collections/articles?pageSize=10&q=saved&status=draft',
  );
});

it('publishes pending and traversed snapshots and releases its subscriber', () => {
  const navigation = createQueryNavigation('q=first');
  const listener = vi.fn<() => void>();
  const unsubscribe = navigation.subscribe(listener);
  navigation.update({ q: 'second' }, build('/dashboard/roles'));
  expect(navigation.getSnapshot()).toBe('q=second');
  navigation.traverse('q=history');
  expect(navigation.getSnapshot()).toBe('q=history');
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
  navigation.update({ q: 'third' }, build('/dashboard/roles'));
  expect(listener).toHaveBeenCalledTimes(2);
});
