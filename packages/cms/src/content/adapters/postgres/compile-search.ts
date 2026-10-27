import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import { compileWhere } from './compile-query.ts';
import { parameter, requireQueryable, fieldSource } from './query-context.ts';
import type { QueryContext } from './query-context.ts';

export function compileSearch(context: QueryContext): string | undefined {
  if (context.query.context !== 'admin') return ordinarySearch(context);
  const { q } = context.query;
  if (!q) return undefined;
  const paths = [
    ...new Set([
      ...(context.collection.definition.search ?? []),
      ...(context.collection.definition.admin?.listSearchableFields ?? []),
    ]),
  ];
  if (paths.length === 0) paths.push(context.collection.definition.admin?.useAsTitle ?? 'id');
  const conditions = paths.flatMap((field) => {
    const values = context.values.length;
    const joins = new Map(context.joins);
    const indexes = new Map(context.indexAliases);
    try {
      if (field === 'id')
        return [
          q
            .trim()
            .split(/\s+/u)
            .map(
              (word) =>
                `${context.documentAlias}.id::text ILIKE ${parameter(context, `%${word.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`)} ESCAPE '\\'`,
            )
            .join(' AND '),
        ];
      return [compileWhere({ field, operator: 'like', value: q }, context)];
    } catch (error) {
      if (!(error instanceof CmsError && error.code === 'forbidden')) throw error;
      context.values.splice(values);
      context.joins = joins;
      context.indexAliases = indexes;
      return [];
    }
  });
  return conditions.length > 0 ? `(${conditions.join(' OR ')})` : 'FALSE';
}

function ordinarySearch(context: QueryContext): string | undefined {
  const { q } = context.query;
  if (q === undefined || q.length === 0) return undefined;
  const paths = context.collection.definition.search ?? [];
  if (paths.length === 0) fail('invalid_input');
  const token = parameter(context, q);
  return `(${paths
    .flatMap((path) => {
      requireQueryable(path, context);
      return context.collection.flat
        .filter((field) => field.path === path)
        .map((field) => {
          const source = fieldSource(field, context);
          return `EXISTS (SELECT 1 FROM ${source.from} WHERE ${source.where} AND ${source.name}.search_vector @@ websearch_to_tsquery('simple',${token}))`;
        });
    })
    .join(' OR ')})`;
}
