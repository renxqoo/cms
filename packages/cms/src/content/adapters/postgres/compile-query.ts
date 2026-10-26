import { targetReadContext } from '../../queries/resolve-locale.ts';
import type { RelationScope } from '../../model.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Where } from '../../definition.ts';
import type { CompiledCollection, FieldMapping } from '../../model.ts';
import type { QueryContext } from './query-context.ts';
import {
  alias,
  fieldSource,
  metadataExpression,
  metadataColumns,
  parameter,
  requireQueryable,
  scalarExpression,
  projectedValue,
  trustedContext,
} from './query-context.ts';
import { comparison, metadataComparison } from './query-comparison.ts';
import { publicationLocale, publicationExpression } from './document-store.ts';

interface PathCondition {
  match: string;
  domain: string;
}
function consumeNode(context: QueryContext): void {
  context.budget.nodes += 1;
  if (context.budget.nodes > context.limits.maxQueryNodes) fail('invalid_input');
}
function fieldCondition(
  field: FieldMapping,
  node: Extract<Where, { field: string }>,
  context: QueryContext,
): string {
  const indexed = projectedValue(field, context);
  if (indexed) return projectedCondition(field, node, { context, indexed });
  const source = fieldSource(field, context);
  if (node.operator === 'exists') {
    if (typeof node.value !== 'boolean') fail('invalid_input');
    const exists = `EXISTS (SELECT 1 FROM ${source.from} WHERE ${source.where} AND ${source.name}.state<>'null')`;
    return node.value ? exists : `NOT ${exists}`;
  }
  const condition = comparison({
    expression: `${source.name}.value`,
    operator: node.operator,
    value: node.value,
    field,
    context,
  });
  return `EXISTS (SELECT 1 FROM ${source.from} WHERE ${source.where} AND ${source.name}.state IN ('value','null') AND ${condition})`;
}
function relationCondition(
  node: Extract<Where, { field: string }>,
  context: QueryContext,
): PathCondition | undefined {
  const relations = context.collection.flat.filter(
    (field) =>
      ['relationship', 'upload'].includes(field.field.type) &&
      node.field.startsWith(`${field.path}.`),
  );
  if (relations.length === 0) return undefined;
  if (context.relationDepth >= context.limits.maxQueryDepth) fail('invalid_input');
  const paths = new Map<string, boolean>();
  const matching = relations.filter((relation) =>
    (relation.field.relationTo ?? []).some((target) =>
      hasQueryPath({
        path: node.field.slice(relation.path.length + 1),
        collection: context.mapping.get(target),
        context,
        paths,
        depth: context.relationDepth + 1,
      }),
    ),
  );
  if (matching.length === 0) return undefined;
  const conditions = matching.map((relation) =>
    relationFieldCondition({ relation, node, context, paths }),
  );
  return {
    match: `(${conditions.map((condition) => condition.match).join(' OR ')})`,
    domain: `(${conditions.map((condition) => condition.domain).join(' OR ')})`,
  };
}
function relationFieldCondition(input: {
  relation: FieldMapping;
  node: Extract<Where, { field: string }>;
  context: QueryContext;
  paths: Map<string, boolean>;
}): PathCondition {
  const { relation, node, context, paths } = input;
  requireQueryable(relation.path, context);
  const nestedPath = node.field.slice(relation.path.length + 1);
  const targets = relationTargets({ relation, nestedPath, context, paths });
  if (targets.length === 0) return { match: 'FALSE', domain: 'FALSE' };
  const source = fieldSource(relation, context);
  const conditions: PathCondition[] = [];
  for (const { collection, scope } of targets) {
    const { policy } = scope;
    const documentAlias = alias(context, 'td');
    const revisionAlias = alias(context, 'tr');
    const child = {
      ...context,
      collection,
      query: { ...context.query, locale: scope.locale, fallback: scope.fallback },
      documentAlias,
      revisionAlias,
      queryableFields: scope.queryableFields,
      relationDepth: context.relationDepth + 1,
    };
    const predicates = [
      `${documentAlias}.id=${source.name}.value`,
      `${documentAlias}.collection_id=${parameter(context, collection.definition.id)}`,
      `${documentAlias}.trashed_at IS NULL`,
    ];
    const condition = compilePathCondition({ ...node, field: nestedPath }, child);
    if (typeof policy !== 'boolean') predicates.push(compileWhere(policy, trustedContext(child)));
    const pointer = context.query.mode === 'published'
      ? publicationExpression(documentAlias, parameter(context, publicationLocale(collection.definition, scope.locale)))
      : `${documentAlias}.current_version_id`;
    const from = `FROM content_documents ${documentAlias} JOIN content_revisions ${revisionAlias} ON ${revisionAlias}.id=${pointer} WHERE ${predicates.join(' AND ')}`;
    conditions.push({
      match: `EXISTS (SELECT 1 ${from} AND ${condition.match})`,
      domain: `EXISTS (SELECT 1 ${from} AND ${condition.domain})`,
    });
  }
  const exists = (key: keyof PathCondition) =>
    `EXISTS (SELECT 1 FROM ${source.from} WHERE ${source.where} AND (${conditions.map((condition) => condition[key]).join(' OR ')}))`;
  return { match: exists('match'), domain: exists('domain') };
}
function relationTargets(input: {
  relation: FieldMapping;
  nestedPath: string;
  context: QueryContext;
  paths: Map<string, boolean>;
}) {
  const { relation, nestedPath, context, paths } = input;
  return (relation.field.relationTo ?? []).flatMap((target) => {
    consumeNode(context);
    const collection = context.mapping.get(target);
    if (
      !hasQueryPath({
        path: nestedPath,
        collection,
        context,
        paths,
        depth: context.relationDepth + 1,
      })
    )
      return [];
    const scope = relationScope(context, target);
    return scope.policy === false ? [] : [{ collection, scope }];
  });
}
function hasQueryPath(input: {
  path: string;
  collection: CompiledCollection;
  context: QueryContext;
  paths: Map<string, boolean>;
  depth: number;
}): boolean {
  const { path, collection, context, paths, depth } = input;
  if (depth > context.limits.maxQueryDepth) fail('invalid_input');
  const key = `${collection.definition.key}:${depth}:${path}`;
  const known = paths.get(key);
  if (known !== undefined) return known;
  if (paths.size >= context.limits.maxQueryNodes) fail('invalid_input');
  paths.set(key, false);
  const found =
    Object.hasOwn(metadataColumns, path) ||
    collection.flat.some((field) => field.path === path) ||
    collection.flat.some(
      (field) =>
        ['relationship', 'upload'].includes(field.field.type) &&
        path.startsWith(`${field.path}.`) &&
        (field.field.relationTo ?? []).some((target) =>
          hasQueryPath({
            path: path.slice(field.path.length + 1),
            collection: context.mapping.get(target),
            context,
            paths,
            depth: depth + 1,
          }),
        ),
    );
  paths.set(key, found);
  return found;
}
function compilePathCondition(
  where: Extract<Where, { field: string }>,
  context: QueryContext,
): PathCondition {
  const metadata = metadataExpression(where.field, context);
  if (metadata) {
    consumeNode(context);
    return {
      match: metadataComparison({
        path: where.field,
        expression: metadata,
        operator: where.operator,
        value: where.value,
        context,
      }),
      domain: 'TRUE',
    };
  }
  const fields = context.collection.flat.filter((field) => field.path === where.field);
  const conditions: PathCondition[] = [];
  if (fields.length > 0) {
    requireQueryable(where.field, context);
    for (const field of fields) {
      consumeNode(context);
      conditions.push({ match: fieldCondition(field, where, context), domain: 'TRUE' });
    }
  }
  const relation = relationCondition(where, context);
  if (relation) conditions.push(relation);
  if (conditions.length === 0) fail('invalid_input');
  return {
    match: `(${conditions.map((condition) => condition.match).join(' OR ')})`,
    domain: `(${conditions.map((condition) => condition.domain).join(' OR ')})`,
  };
}
export function compileWhere(where: Where, context: QueryContext): string {
  if ('and' in where || 'or' in where) {
    consumeNode(context);
    return 'and' in where
      ? `(${where.and.map((node) => compileWhere(node, context)).join(' AND ')})`
      : `(${where.or.map((node) => compileWhere(node, context)).join(' OR ')})`;
  }
  if (where.operator === 'exists' && typeof where.value !== 'boolean') fail('invalid_input');
  const negative =
    where.operator === 'ne' ||
    where.operator === 'notIn' ||
    (where.operator === 'exists' && where.value === false);
  let { operator } = where;
  if (operator === 'ne') operator = 'eq';
  if (operator === 'notIn') operator = 'in';
  const positive = {
    ...where,
    operator,
    value: where.operator === 'exists' ? true : where.value,
  } satisfies Extract<Where, { field: string }>;
  const condition = compilePathCondition(positive, context);
  return negative
    ? `(${condition.domain} AND NOT COALESCE(${condition.match},false))`
    : condition.match;
}
export function compileOrder(context: QueryContext): string {
  const sort = context.query.sort ?? context.collection.definition.defaultSort ?? [];
  const statements = sort.map((entry) => {
    requireQueryable(entry.field, context);
    const metadata = metadataExpression(entry.field, context);
    const field = context.collection.flat.find((item) => item.path === entry.field);
    if (!metadata && !field) fail('invalid_input');
    const expression = metadata ?? (field && scalarExpression(field, context));
    return `${expression} ${entry.order.toUpperCase()} NULLS LAST`;
  });
  statements.push(`${context.documentAlias}.id ASC`);
  return statements.join(',');
}
export function compileSearch(context: QueryContext): string | undefined {
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
function projectedCondition(
  field: FieldMapping,
  node: Extract<Where, { field: string }>,
  input: { context: QueryContext; indexed: NonNullable<ReturnType<typeof projectedValue>> },
): string {
  const { context, indexed } = input;
  if (node.operator === 'exists') {
    if (typeof node.value !== 'boolean') fail('invalid_input');
    const exists = `(${indexed.present} AND ${indexed.expression} IS NOT NULL)`;
    return node.value ? exists : `NOT ${exists}`;
  }
  const condition = comparison({
    expression: indexed.expression,
    operator: node.operator,
    value: node.value,
    field,
    context,
    ...(indexed.targetExpression ? { targetExpression: indexed.targetExpression } : {}),
  });
  return `(${indexed.present} AND ${condition})`;
}

function relationScope(context: QueryContext, target: string): RelationScope {
  const { locale } = targetReadContext({
    collection: context.mapping.get(target).definition,
    locale: context.query.locale,
  });
  const scope = context.relationScopes.find(
    (candidate) => candidate.collection === target && candidate.locale === locale,
  );
  if (!scope) fail('forbidden');
  return scope;
}
