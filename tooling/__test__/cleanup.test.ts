import { expect, it } from 'vitest';
import { cleanupAll } from '../../test/support/cleanup.ts';

it('awaits every resource cleanup even when one fails synchronously and another rejects', async () => {
  const closed: string[] = [];
  const syncFailure = new Error('Storage removal failed');
  const asyncFailure = new Error('Database shutdown failed');
  const result = cleanupAll([
    () => {
      closed.push('storage');
      throw syncFailure;
    },
    () => {
      closed.push('database');
      return Promise.reject(asyncFailure);
    },
    () => Promise.resolve().then(() => closed.push('smtp')),
  ]);
  await expect(result).rejects.toMatchObject({ errors: [syncFailure, asyncFailure] });
  expect(closed).toEqual(['storage', 'database', 'smtp']);
});

it('finishes cleanup when an interrupted startup has not allocated every resource', async () => {
  const closed: string[] = [];
  await cleanupAll([() => null, () => closed.push('database')]);
  expect(closed).toEqual(['database']);
});
