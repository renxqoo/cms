import { fail } from '@new-cms/cms/platform/contracts';
import { fieldPaths } from '../../fields/structure.ts';
import { compileWhere } from './compile-query.ts';
import {
  fieldSource,
  metadataExpression,
  metadataColumns,
  parameter,
  requireQueryable,
  trustedContext,
  alias,
} from './query-context.ts';
import { relatedContext, relationScope } from './related-context.ts';
import { publicationExpression, publicationLocale } from './document-store.ts';
import type { QueryContext } from './query-context.ts';
import type { FieldMapping, RelationScope } from '../../model.ts';

function consume(context: QueryContext) {
  context.budget.nodes += 1;
  if (
    context.budget.nodes > context.limits.maxQueryNodes ||
    context.relationDepth > context.limits.maxQueryDepth
  )
    fail('invalid_input');
}

function requireValueReadable(path: string, context: QueryContext) {
  requireQueryable(path, context);
  if (context.valueReadableFields && !context.valueReadableFields.includes(path)) fail('forbidden');
}

function utcJson(expression: string): string {
  return `to_jsonb(to_char(${expression} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
}

function directValues(field: FieldMapping, context: QueryContext): string {
  if (field.structural || ['join', 'richText'].includes(field.field.type)) fail('invalid_input');
  const source = fieldSource(field, context);
  let value = `to_jsonb(${source.name}.value)`;
  if (field.field.type === 'date') value = utcJson(`${source.name}.value`);
  return `SELECT ${value} AS value FROM ${source.from} WHERE ${source.where} AND ${source.name}.state IN('value','null')`;
}

function referenceValues(field: FieldMapping, context: QueryContext): string {
  const source = fieldSource(field, context);
  const statements = (field.field.relationTo ?? []).flatMap((target) => {
    const scope = relationScope(context, target);
    if (scope.policy === false) return [];
    const values = targetValues({ relation: field, source, path: 'id', context }, target, scope);
    return [
      `SELECT jsonb_build_object('collection',${parameter(context, target)}::text,'id',reference_value.value) AS value FROM (${values}) reference_value`,
    ];
  });
  statements.push(
    `SELECT NULL::jsonb AS value WHERE NOT EXISTS(SELECT 1 FROM ${source.from} WHERE ${source.where} AND ${source.name}.state='value')`,
  );
  return statements.join(' UNION ALL ');
}

function nullableValues(statements: readonly string[]): string {
  return `SELECT v.value FROM (SELECT 1) seed LEFT JOIN LATERAL(${statements.join(' UNION ALL ')}) v ON true`;
}

function redirected(path: string, context: QueryContext): string | undefined {
  const [entry] = fieldPaths(context.collection.definition.fields)
    .filter(
      ({ field, path: prefix }) =>
        typeof field.virtual === 'string' && (path === prefix || path.startsWith(`${prefix}.`)),
    )
    .toSorted((a, b) => b.path.length - a.path.length);
  if (!entry || typeof entry.field.virtual !== 'string') return undefined;
  requireValueReadable(entry.path, context);
  return `${entry.field.virtual}${path.slice(entry.path.length)}`;
}

function targetValues(
  input: {
    relation: FieldMapping;
    source: ReturnType<typeof fieldSource>;
    path: string;
    context: QueryContext;
  },
  target: string,
  scope: RelationScope,
): string {
  const child = relatedContext(input.context, input.context.mapping.get(target), scope);
  const values = groupValues(input.path, child);
  const predicates = [
    `${child.documentAlias}.id=${input.source.name}.value`,
    `${child.documentAlias}.collection_id=${parameter(child, child.collection.definition.id)}`,
    `${child.documentAlias}.trashed_at IS NULL`,
  ];
  const policy =
    typeof scope.policy === 'boolean'
      ? ''
      : ` AND ${compileWhere(scope.policy, trustedContext(child))}`;
  const pointer =
    child.query.mode === 'published'
      ? publicationExpression(
          child.documentAlias,
          parameter(child, publicationLocale(child.collection.definition, child.query.locale)),
        )
      : `${child.documentAlias}.current_version_id`;
  return `SELECT gv.value FROM ${input.source.from} JOIN content_documents ${child.documentAlias} ON ${predicates.join(' AND ')} JOIN content_revisions ${child.revisionAlias} ON ${child.revisionAlias}.id=${pointer} CROSS JOIN LATERAL(${values}) gv WHERE ${input.source.where} AND ${input.source.name}.state='value'${policy}`;
}

function relationValues(relation: FieldMapping, path: string, context: QueryContext): string {
  requireValueReadable(relation.path, context);
  const source = fieldSource(relation, context);
  const statements = (relation.field.relationTo ?? []).flatMap((target) => {
    const child = {
      ...context,
      collection: context.mapping.get(target),
      relationDepth: context.relationDepth + 1,
    };
    if (!hasGroupPath(path, child)) return [];
    const scope = relationScope(context, target);
    if (scope.policy === false) return [];
    return [targetValues({ relation, source, path, context }, target, scope)];
  });
  statements.push(
    `SELECT NULL::jsonb AS value WHERE NOT EXISTS(SELECT 1 FROM ${source.from} WHERE ${source.where} AND ${source.name}.state='value')`,
  );
  return statements.join(' UNION ALL ');
}

function hasGroupPath(path: string, context: QueryContext, seen: readonly string[] = []): boolean {
  consume(context);
  const identity = `${context.collection.definition.key}:${path}`;
  if (seen.includes(identity)) fail('invalid_input');
  if (
    Object.hasOwn(metadataColumns, path) ||
    context.collection.flat.some((field) => field.path === path)
  )
    return true;
  const virtual = fieldPaths(context.collection.definition.fields).find(
    ({ field, path: prefix }) =>
      typeof field.virtual === 'string' && (path === prefix || path.startsWith(`${prefix}.`)),
  );
  if (virtual && typeof virtual.field.virtual === 'string')
    return hasGroupPath(`${virtual.field.virtual}${path.slice(virtual.path.length)}`, context, [
      ...seen,
      identity,
    ]);
  return context.collection.flat.some(
    (field) =>
      ['relationship', 'upload'].includes(field.field.type) &&
      path.startsWith(`${field.path}.`) &&
      field.field.relationTo?.some((target) =>
        hasGroupPath(
          path.slice(field.path.length + 1),
          {
            ...context,
            collection: context.mapping.get(target),
            relationDepth: context.relationDepth + 1,
          },
          [...seen, identity],
        ),
      ),
  );
}

export function groupValues(
  path: string,
  context: QueryContext,
  redirects: readonly string[] = [],
): string {
  consume(context);
  if (redirects.includes(path)) fail('invalid_input');
  const redirect = redirected(path, context);
  if (redirect) return groupValues(redirect, context, [...redirects, path]);
  const metadata = metadataExpression(path, context);
  if (metadata)
    return `SELECT ${['createdAt', 'updatedAt', 'trashedAt'].includes(path) ? utcJson(metadata) : `to_jsonb(${metadata})`} AS value`;
  const fields = context.collection.flat.filter((field) => field.path === path);
  if (fields.length > 0) {
    requireValueReadable(path, context);
    return fields[0]?.columnType === 'uuid'
      ? fields.map((field) => referenceValues(field, context)).join(' UNION ALL ')
      : nullableValues(fields.map((field) => directValues(field, context)));
  }
  const relations = context.collection.flat.filter(
    (field) =>
      ['relationship', 'upload'].includes(field.field.type) && path.startsWith(`${field.path}.`),
  );
  if (relations.length === 0) fail('invalid_input');
  return relations
    .map((relation) => relationValues(relation, path.slice(relation.path.length + 1), context))
    .join(' UNION ALL ');
}

export function groupMembership(
  context: QueryContext,
  input: { field: string; value: unknown },
): string {
  const values = groupValues(input.field, context);
  return `EXISTS(SELECT 1 FROM (${values}) grouped_value WHERE grouped_value.value IS NOT DISTINCT FROM ${parameter(context, input.value === null ? null : JSON.stringify(input.value))}::jsonb)`;
}

export function groupProjection(context: QueryContext, path: string): string {
  const name = alias(context, 'gv');
  const values = groupValues(path, context);
  context.joins.set(name, `CROSS JOIN LATERAL(${values}) ${name}`);
  return `${name}.value`;
}
