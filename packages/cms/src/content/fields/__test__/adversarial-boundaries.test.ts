import { expect, it } from 'vitest';
import type { Principal } from '@new-cms/cms/access';
import { contentLimits } from '../../../../../../test/support/content.ts';
import { createRegistry } from '../../generate.ts';
import type { CollectionDefinition, FieldPolicyContext } from '../../definition.ts';
import { parseQuery } from '../../queries/parse-query.ts';
import { validateData } from '../validate-data.ts';
import { assertWritableData } from '../policy-write.ts';
import { projectData } from '../policy-read.ts';
import { queryableFields } from '../policy-metadata.ts';

const time = '2026-10-26T00:00:00.000Z';
const actor: Principal = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'reader@example.test',
  displayName: null,
  roleId: '10000000-0000-4000-8000-000000000002',
  roleCode: 'reader',
  status: 'active',
  activation: 'activated',
  version: 1,
  createdAt: time,
  updatedAt: time,
  lastLoginAt: null,
  role: {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'reader',
    name: 'Reader',
    description: null,
    status: 'active',
    isSuper: false,
    version: 1,
    createdAt: time,
    updatedAt: time,
  },
};
const context: FieldPolicyContext = {
  actor,
  operation: 'documents.get',
  collectionKey: 'items',
  locale: 'en',
};
function definition(): CollectionDefinition {
  return {
    id: 'adversarial_fields',
    key: 'items',
    label: 'Items',
    schemaVersion: 1,
    mode: 'direct',
    history: false,
    locales: { default: 'en', supported: ['en'], fallback: {} },
    fields: [
      { id: 'text', name: 'text', type: 'text' },
      { id: 'json', name: 'json', type: 'json' },
    ],
  };
}
function nestedWhere(depth: number): unknown {
  let where: unknown = { field: 'text', operator: 'eq', value: 'Visible' };
  for (let index = 1; index < depth; index += 1) where = { and: [where] };
  return where;
}
it('query depth and node limits reject garbage before recursive schema parsing can overflow', () => {
  const collection = definition();
  const limits = contentLimits({ maxQueryDepth: 4, maxQueryNodes: 5 });
  expect(parseQuery({ collection, limits, input: { where: nestedWhere(4) } }).where).toEqual(
    nestedWhere(4),
  );
  expect(() => parseQuery({ collection, limits, input: { where: nestedWhere(5) } })).toThrowError(
    'invalid input',
  );
  expect(() =>
    parseQuery({ collection, limits, input: { where: nestedWhere(50000) } }),
  ).toThrowError('invalid input');
  const leaf = { field: 'text', operator: 'eq', value: 'Visible' };
  expect(
    parseQuery({ collection, limits, input: { where: { or: [leaf, leaf, leaf, leaf] } } }).where,
  ).toEqual({ or: [leaf, leaf, leaf, leaf] });
  expect(() =>
    parseQuery({ collection, limits, input: { where: { or: [leaf, leaf, leaf, leaf, leaf] } } }),
  ).toThrowError('invalid input');
});
it('query values and document JSON reject deeply nested and cyclic garbage with domain errors', async () => {
  const collection = definition();
  const limits = contentLimits();
  let nested: unknown = 'leaf';
  for (let index = 0; index < 50000; index += 1) nested = { child: nested };
  expect(() =>
    parseQuery({
      collection,
      limits,
      input: { where: { field: 'json', operator: 'contains', value: nested } },
    }),
  ).toThrowError('payload too large');
  await expect(
    validateData({ collection, data: { json: nested }, locale: 'en', mode: 'draft', limits }),
  ).rejects.toThrowError('payload too large');
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  await expect(
    validateData({ collection, data: { json: cycle }, locale: 'en', mode: 'draft', limits }),
  ).rejects.toThrowError('invalid input');
  expect(() =>
    parseQuery({
      collection,
      limits,
      input: { where: { field: 'json', operator: 'contains', value: cycle } },
    }),
  ).toThrowError('invalid input');
});
it('parent field policies protect descendant read, query and write paths even when child rules allow', async () => {
  const deny = { version: '1', run: () => false };
  const allow = { version: '1', run: () => true };
  const raw: CollectionDefinition = {
    ...definition(),
    fields: [
      { id: 'visible', name: 'visible', type: 'text' },
      {
        id: 'private',
        name: 'private',
        type: 'group',
        access: { read: deny, write: deny },
        fields: [
          {
            id: 'child',
            name: 'child',
            type: 'text',
            access: { read: allow, query: allow, write: allow },
          },
        ],
      },
    ],
  };
  const collection = createRegistry({ collections: [raw], limits: contentLimits() }).get('items');
  const data = { visible: 'Visible', private: { child: 'Secret' } };
  expect(
    await projectData({
      ...scope(),
      collection,
      data,
      context,
    }),
  ).toEqual({ visible: 'Visible' });
  expect(
    await projectData({
      ...scope(),
      collection,
      data,
      context,
      select: ['private.child'],
    }),
  ).toEqual({});
  expect(
    await queryableFields({
      ...scope(),
      collection,
      context,
    }),
  ).toEqual(['visible']);
  await expect(
    assertWritableData({
      ...scope(),
      collection,
      context,
      data: { private: { child: 'Attempt' } },
    }),
  ).rejects.toThrowError('forbidden');
  await expect(
    assertWritableData({
      ...scope(),
      collection,
      context,
      data: { visible: 'Allowed' },
    }),
  ).resolves.toBeUndefined();
});
it('legitimate prototype-method field names only read and authorize explicitly provided values', async () => {
  const raw = {
    ...definition(),
    fields: [
      {
        id: 'method_name',
        name: 'toString',
        type: 'text' as const,
        access: { write: { version: '1', run: () => false } },
      },
    ],
  };
  const collection = createRegistry({ collections: [raw], limits: contentLimits() }).get('items');
  expect(
    await validateData({
      collection,
      data: {},
      locale: 'en',
      mode: 'draft',
      limits: contentLimits(),
    }),
  ).toEqual({});
  expect(
    await projectData({
      ...scope(),
      collection,
      data: {},
      context,
    }),
  ).toEqual({});
  await expect(
    assertWritableData({
      ...scope(),
      collection,
      data: {},
      context,
    }),
  ).resolves.toBeUndefined();
  expect(
    await validateData({
      collection,
      data: { toString: 'Explicit text' },
      locale: 'en',
      mode: 'draft',
      limits: contentLimits(),
    }),
  ).toEqual({ toString: 'Explicit text' });
  await expect(
    assertWritableData({
      ...scope(),
      collection,
      data: { toString: 'Explicit text' },
      context,
    }),
  ).rejects.toThrowError('forbidden');
});

function scope() {
  return { limits: contentLimits(), functions: { budget: { used: 0 } } };
}
