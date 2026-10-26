import { expect, it } from 'vitest';
import {
  cleanupFixtureConnection,
  markHistoricalCleanupFailure,
} from '../../test/support/admin-cleanup-fixture.ts';

const development = {
  connectionString: 'postgresql:///cms_development?host=/tmp',
  schema: `cms_test_${'a'.repeat(32)}`,
};
const production = {
  connectionString: 'postgresql:///cms_production?host=/tmp',
  schema: `cms_test_${'b'.repeat(32)}`,
};

it('uses the exact mode-specific connection and schema instead of a default public schema', () => {
  const encoded = JSON.stringify([development, production]);
  expect(cleanupFixtureConnection('development', encoded)).toEqual(development);
  expect(cleanupFixtureConnection('production', encoded)).toEqual(production);
  expect(() => cleanupFixtureConnection('unknown', encoded)).toThrow('Unknown browser realm');
});

it('rejects missing, public, injected and shared schema identities before opening a pool', () => {
  for (const encoded of [
    'invalid',
    'null',
    JSON.stringify([development]),
    JSON.stringify([development, development]),
    JSON.stringify([development, { ...production, schema: 'public' }]),
    JSON.stringify([development, { ...production, schema: 'cms_test_bad;DROP DATABASE postgres' }]),
  ]) {
    expect(() => cleanupFixtureConnection('development', encoded)).toThrow(
      /configuration|distinct/,
    );
  }
});

it('rejects an object not exposed by the real cleanup response before connecting to any database', async () => {
  await expect(
    markHistoricalCleanupFailure({
      project: 'development',
      id: '50000000-0000-4000-8000-000000000001',
      visibleIds: [],
    }),
  ).rejects.toThrow('exposed by the actual cleanup API');
  await expect(
    markHistoricalCleanupFailure({
      project: 'development',
      id: 'not-a-uuid',
      visibleIds: ['not-a-uuid'],
    }),
  ).rejects.toThrow('exposed by the actual cleanup API');
});
