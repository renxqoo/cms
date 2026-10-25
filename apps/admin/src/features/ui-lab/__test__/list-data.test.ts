import { expect, it } from 'vitest';
import { createExampleDocuments, queryExampleDocuments } from '../list-data';
import { parseListQuery } from '../list-query';

it('list search combines the localized title, category and selected status', () => {
  const rows = createExampleDocuments();
  const query = parseListQuery(new URLSearchParams('q=指南&status=draft'));
  expect(queryExampleDocuments(rows, query, 'zh').map((row) => row.id)).toEqual([
    'example-guide',
    'example-media',
  ]);
  expect(
    queryExampleDocuments(rows, parseListQuery(new URLSearchParams('q=design')), 'en').map(
      (row) => row.id,
    ),
  ).toEqual(['example-design']);
});

it('sorting is observable in both directions without changing the original rows', () => {
  const rows = createExampleDocuments();
  const asc = parseListQuery(new URLSearchParams('sort=updatedAt&order=asc'));
  const desc = parseListQuery(new URLSearchParams('sort=updatedAt&order=desc'));
  expect(queryExampleDocuments(rows, asc, 'en')[0]?.id).toBe('example-release');
  expect(queryExampleDocuments(rows, desc, 'en')[0]?.id).toBe('example-introduction');
  expect(rows[0]?.id).toBe('example-introduction');
});

it('separate workbench instances never share edited sample content', () => {
  const first = createExampleDocuments();
  const second = createExampleDocuments();
  const [firstRow] = first;
  if (!firstRow) throw new Error('Missing example fixture');
  firstRow.title.en = 'Changed in this workbench';
  expect(second[0]?.title.en).toBe('Welcome to OneAster');
});
