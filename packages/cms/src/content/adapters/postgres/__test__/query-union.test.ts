import { expect, it } from 'vitest';
import type { SqlExecutor } from '@new-cms/database/client';
import { queryJoinedDocuments } from '../query-union.ts';
import { createRegistry, generateArtifacts } from '../../../generate.ts';
import { workflowCollections } from '../../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import type { JoinedQueryInput } from '../store-contract.ts';

const limits = contentLimits();
const { mapping } = generateArtifacts(
  createRegistry({ collections: workflowCollections(), limits }),
);
const source = {
  collection: 'pages',
  query: {
    locale: 'en',
    fallback: [],
    mode: 'editing' as const,
    page: 1,
    pageSize: 1,
    trashed: false,
    sort: [],
    select: [],
  },
};
const input: JoinedQueryInput = {
  groups: [{ key: 'one', collections: [source] }],
  page: 1,
  pageSize: 1,
  sort: [],
  count: true,
};

it('rejects invalid union pagination, duplicate scopes and mismatched decode languages before issuing SQL', async () => {
  let requests = 0;
  const tx: SqlExecutor = {
    query: () => {
      requests += 1;
      return Promise.reject(new Error('Unexpected SQL'));
    },
  };
  const invalid: JoinedQueryInput[] = [
    { ...input, page: 0 },
    { ...input, page: 1.5 },
    { ...input, pageSize: 0 },
    { ...input, pageSize: limits.maxPageSize + 1 },
    { ...input, page: Number.MAX_SAFE_INTEGER, pageSize: 2 },
    {
      ...input,
      sort: Array.from({ length: limits.maxQueryNodes + 1 }, () => ({
        field: 'id',
        order: 'asc' as const,
      })),
    },
    {
      ...input,
      groups: [
        { key: 'one', collections: [source] },
        { key: 'one', collections: [source] },
      ],
    },
    { ...input, groups: [{ key: 'one', collections: [source, source] }] },
    { ...input, maxRows: -1 },
    { ...input, maxRows: Number.NaN },
    { ...input, groups: [{ key: 'one', copies: 0, collections: [source] }] },
    {
      ...input,
      groups: [
        { key: 'one', collections: [source] },
        { key: 'two', collections: [{ ...source, query: { ...source.query, locale: 'zh' } }] },
      ],
    },
  ];
  for (const values of invalid)
    await expect(queryJoinedDocuments(tx, { ...values, mapping, limits })).rejects.toMatchObject({
      code: 'invalid_input',
    });
  await expect(
    queryJoinedDocuments(tx, {
      ...input,
      mapping,
      limits,
      groups: Array.from({ length: limits.maxExpandNodes + 1 }, (_, index) => ({
        key: String(index),
        collections: [],
      })),
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  expect(requests).toBe(0);
});

it('returns stable empty pages with optional counts without opening SQL for entirely unauthorized target groups', async () => {
  const tx: SqlExecutor = { query: () => Promise.reject(new Error('Unexpected SQL')) };
  const first = await queryJoinedDocuments(tx, {
    ...input,
    mapping,
    limits,
    groups: [
      { key: 'one', collections: [] },
      { key: 'two', collections: [] },
    ],
    count: false,
    maxRows: 0,
  });
  expect([...first.values()]).toEqual([
    { rows: [], page: 1, pageSize: 1, hasNextPage: false },
    { rows: [], page: 1, pageSize: 1, hasNextPage: false },
  ]);
  const counted = await queryJoinedDocuments(tx, {
    ...input,
    mapping,
    limits,
    groups: [{ key: 'one', collections: [] }],
    page: 3,
  });
  expect(counted.get('one')).toEqual({
    rows: [],
    page: 3,
    pageSize: 1,
    hasNextPage: false,
    total: 0,
  });
});
