import { expect, it } from 'vitest';
import { operations } from '@new-cms/api-client/operations';
import { applicationOperations } from '../../apps/api/src/config/operations.ts';

it('keeps generated HTTP and SDK command coverage in agreement with the actual registered operations', () => {
  expect(applicationOperations).toHaveLength(124);
  const actual = applicationOperations
    .map((operation) => ({ id: operation.id, method: operation.method, path: operation.path }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
  const client = operations
    .map((operation) => ({ id: operation.id, method: operation.method, path: operation.path }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
  expect(client).toEqual(actual);
});
