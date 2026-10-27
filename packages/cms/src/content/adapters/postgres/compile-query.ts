import { relatedContext, relationScope } from './related-context.ts';
import { safeDefaultSort } from '../../queries/default-sort.ts';
import type { RelationScope } from '../../model.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Where, QueryOperator } from '../../definition.ts';
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
import { planarDistanceExpression } from './query-geo.ts';
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
  if (node.operator === 'near' && field.field.type === 'point') {
    context.nearOrder = () => {
      const distance = planarDistanceExpression(node.value, `${source.name}.value`, context);
      return `(SELECT min(${distance}) FROM ${source.from} WHERE ${source.where} AND ${source.name}.state='value' AND ${condition})`;
    };
  }
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
  const orders: (() => string)[] = [];
  for (const { collection, scope } of targets) {
    const { condition, from, order } = relationQuery({
      collection,
      scope,
      context,
      source: source.name,
      node: { ...node, field: nestedPath },
    });
    conditions.push({
      match: `EXISTS (SELECT 1 ${from} AND ${condition.match})`,
      domain: `EXISTS (SELECT 1 ${from} AND ${condition.domain})`,
    });
    if (node.operator === 'near' && order)
      orders.push(() => `(SELECT ${order()} ${from} AND ${condition.match})`);
  }
  if (orders.length > 0)
    context.nearOrder = () => {
      const order = alias(context, 'no');
      return `(SELECT min(${order}.distance) FROM ${source.from} CROSS JOIN LATERAL (VALUES ${orders.map((value) => `(${value()})`).join(',')}) ${order}(distance) WHERE ${source.where})`;
    };
  const exists = (key: keyof PathCondition) =>
    `EXISTS (SELECT 1 FROM ${source.from} WHERE ${source.where} AND (${conditions.map((condition) => condition[key]).join(' OR ')}))`;
  return { match: exists('match'), domain: exists('domain') };
}
function relationQuery(input: {
  collection: CompiledCollection;
  scope: RelationScope;
  context: QueryContext;
  source: string;
  node: Extract<Where, { field: string }>;
}) {
  const { collection, scope, context, source, node } = input;
  const child = relatedContext(context, collection, scope);
  const { documentAlias, revisionAlias } = child;
  const predicates = [
    `${documentAlias}.id=${source}.value`,
    `${documentAlias}.collection_id=${parameter(context, collection.definition.id)}`,
    `${documentAlias}.trashed_at IS NULL`,
  ];
  const condition = compilePathCondition(node, child);
  if (typeof scope.policy !== 'boolean')
    predicates.push(compileWhere(scope.policy, trustedContext(child)));
  const pointer =
    context.query.mode === 'published'
      ? publicationExpression(
          documentAlias,
          parameter(context, publicationLocale(collection.definition, scope.locale)),
        )
      : `${documentAlias}.current_version_id`;
  const from = `FROM content_documents ${documentAlias} JOIN content_revisions ${revisionAlias} ON ${revisionAlias}.id=${pointer} WHERE ${predicates.join(' AND ')}`;
  return { condition, from, order: child.nearOrder };
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
function normalizedComparison(where: Extract<Where, { field: string }>) {
  const operators: Partial<Record<QueryOperator, QueryOperator>> = {
    ne: 'eq',
    notIn: 'in',
    notLike: 'like',
  };
  const operator = operators[where.operator] ?? where.operator;
  return {
    negative: operator !== where.operator || (where.operator === 'exists' && where.value === false),
    positive: { ...where, operator, value: where.operator === 'exists' ? true : where.value },
  };
}

function allCondition(where: Extract<Where, { field: string }>, context: QueryContext): string {
  if (
    !Array.isArray(where.value) ||
    where.value.length === 0 ||
    where.value.length > context.limits.maxArrayItems
  )
    fail('invalid_input');
  consumeNode(context);
  return `(${where.value.map((value) => compileWhere({ ...where, operator: 'eq', value }, context)).join(' AND ')})`;
}

export function compileWhere(where: Where, context: QueryContext): string {
  if ('and' in where || 'or' in where) {
    consumeNode(context);
    return 'and' in where
      ? `(${where.and.map((node) => compileWhere(node, context)).join(' AND ')})`
      : `(${where.or.map((node) => compileWhere(node, context)).join(' OR ')})`;
  }
  if (
    ['createdBy', 'updatedBy'].includes(where.field.split('.').at(-1) ?? '') &&
    !['eq', 'ne', 'in', 'notIn', 'exists'].includes(where.operator)
  )
    fail('invalid_input');
  if (where.operator === 'all') return allCondition(where, context);
  if (where.operator === 'exists' && typeof where.value !== 'boolean') fail('invalid_input');
  const { negative, positive } = normalizedComparison(where);
  const condition = compilePathCondition(positive, context);
  return negative
    ? `(${condition.domain} AND NOT COALESCE(${condition.match},false))`
    : condition.match;
}
export function compileSortValues(
  context: QueryContext,
): { expression: string; order: 'asc' | 'desc' }[] {
  if (context.nearOrder) return [{ expression: context.nearOrder(), order: 'asc' }];
  const sort =
    context.query.sort ??
    safeDefaultSort(
      context.collection.definition,
      context.queryableFields.filter(
        (path) => !context.valueReadableFields || context.valueReadableFields.includes(path),
      ),
    );
  return sort.map((entry) => ({
    expression: sortExpression(entry.field, context),
    order: entry.order,
  }));
}

function sortExpression(path: string, context: QueryContext): string {
  if (path === '_order') {
    if (!context.collection.definition.orderable && context.orderScope === undefined)
      fail('invalid_input');
    if (context.orderScope !== undefined)
      return `coalesce((SELECT position FROM content_document_order WHERE document_id=${context.documentAlias}.id AND scope_key=${parameter(context, context.orderScope)}),(SELECT initial_position FROM content_document_order WHERE document_id=${context.documentAlias}.id AND scope_key=''))`;
    return `(SELECT position FROM content_document_order WHERE document_id=${context.documentAlias}.id AND scope_key='')`;
  }
  requireQueryable(path, context);
  const metadata = metadataExpression(path, context);
  const field = context.collection.flat.find((item) => item.path === path);
  if (!metadata && !field) fail('invalid_input');
  const expression = metadata ?? (field && scalarExpression(field, context));
  if (!expression) fail('invalid_input');
  return expression;
}

export function compileOrder(context: QueryContext, sorts = compileSortValues(context)): string {
  const statements = sorts.map(
    ({ expression, order }) => `${expression} ${order.toUpperCase()} NULLS LAST`,
  );
  statements.push(`${context.documentAlias}.id ASC`);
  return statements.join(',');
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
