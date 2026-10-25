import { expect, it } from 'vitest';
import { contentDefinitions, contentLimits } from '../../../../../../test/support/content.ts';
import { createRegistry } from '../../collections/create-registry.ts';
import { parseQuery } from '../parse-query.ts';
import type { Where } from '../../definition.ts';
function collection() {
  return createRegistry({ collections: contentDefinitions(), limits: contentLimits() }).get(
    'articles',
  );
}
it('a deeply nested AST fails its semantic budget before recursive schema parsing', () => {
  let where: Where = { field: 'title', operator: 'eq', value: 'Value' };
  for (let index = 0; index < 20000; index += 1) where = { and: [where] };
  expect(() =>
    parseQuery({ collection: collection(), input: { where }, limits: contentLimits() }),
  ).toThrowError('invalid input');
  const value: unknown = JSON.parse(`${'['.repeat(20000)}0${']'.repeat(20000)}`);
  expect(() =>
    parseQuery({
      collection: collection(),
      input: { where: { field: 'extra', operator: 'contains', value } },
      limits: contentLimits(),
    }),
  ).toThrowError('payload too large');
});
it('projection rejects unknown paths and configured locale fallback is the read default', () => {
  const definition = collection();
  expect(() =>
    parseQuery({ collection: definition, input: { select: ['typo'] }, limits: contentLimits() }),
  ).toThrowError('invalid input');
  expect(
    parseQuery({ collection: definition, input: { locale: 'zh-CN' }, limits: contentLimits() })
      .fallback,
  ).toEqual(['en']);
  expect(
    parseQuery({
      collection: definition,
      input: { locale: 'zh-CN', fallback: [] },
      limits: contentLimits(),
    }).fallback,
  ).toEqual([]);
  expect(() =>
    parseQuery({
      collection: definition,
      input: { locale: 'en', fallback: ['en'] },
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
});
it.each([
  { page: 0 },
  { pageSize: 101 },
  { depth: 4 },
  { fallback: ['unknown'] },
  { fallback: ['zh-CN', 'zh-CN'] },
  { where: { and: [] } },
  { where: { field: 'title', operator: 'unknown', value: 'x' } },
  { select: ['title', 'title'] },
])('rejects malformed and over-budget query %j', (input) => {
  expect(() =>
    parseQuery({ collection: collection(), input, limits: contentLimits() }),
  ).toThrowError('invalid input');
});
