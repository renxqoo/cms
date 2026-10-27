import { expect, it } from 'vitest';
import { createRegistry, generateArtifacts } from '../../../generate.ts';
import { workflowCollections } from '../../../../../../../test/support/content-runtime.ts';
import { contentLimits } from '../../../../../../../test/support/content.ts';
import { contextFor, querySql } from '../query-documents.ts';

it('regression: implicit default sorting never requires a field denied in the selected content locale', () => {
  const limits = contentLimits();
  const { mapping } = generateArtifacts(
    createRegistry({ collections: workflowCollections(), limits }),
  );
  const input = {
    mapping,
    limits,
    collection: 'articles',
    queryableFields: [],
    query: { locale: 'zh', fallback: ['en'], mode: 'editing' as const, page: 1, pageSize: 2 },
  };
  const context = contextFor(input);
  const compiled = querySql(context, context.query.where);
  expect(compiled.sql).toContain('d."updated_at" DESC');
  expect(compiled.sql).not.toContain('title');
  expect(() =>
    querySql(
      contextFor({ ...input, query: { ...input.query, sort: [{ field: 'title', order: 'asc' }] } }),
      context.query.where,
    ),
  ).toThrowError(expect.objectContaining({ code: 'forbidden' }));
});
