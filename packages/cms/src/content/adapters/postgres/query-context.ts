import { authorshipSettings } from '../../authorship/config.ts';
import type { RelationScope } from '../../model.ts';
import type { CompiledCollection, ContentMapping, FieldMapping, QueryInput } from '../../model.ts';
import type { ContentLimits, JsonValue } from '../../definition.ts';
import { identifier } from '@new-cms/database/codegen';
import { fail } from '@new-cms/cms/platform/contracts';
import { targetReadContext } from '../../queries/resolve-locale.ts';

export interface QueryContext {
  mapping: ContentMapping;
  collection: CompiledCollection;
  query: QueryInput;
  queryableFields: readonly string[];
  relationScopes: readonly RelationScope[];
  limits: ContentLimits;
  values: unknown[];
  aliases: { value: number };
  documentAlias: string;
  revisionAlias: string;
  joins: Map<string, string>;
  indexAliases: Map<string, readonly string[]>;
  relationDepth: number;
  budget: { nodes: number };
  nearOrder?: () => string;
  orderScope?: string;
  grouping?: { field: string; value: JsonValue };
  valueReadableFields?: readonly string[];
}
export function parameter(context: QueryContext, value: unknown): string {
  context.values.push(value);
  return `$${context.values.length}`;
}
export function alias(context: QueryContext, prefix: string): string {
  context.aliases.value += 1;
  return `${prefix}${context.aliases.value}`;
}
export const metadataColumns: Readonly<Record<string, string>> = {
  id: 'id',
  createdBy: 'created_by',
  updatedBy: 'updated_by',
  revision: 'revision',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  trashedAt: 'trashed_at',
  folderId: 'folder_id',
};
export function metadataExpression(path: string, context: QueryContext): string | undefined {
  if (path === 'createdBy' || path === 'updatedBy') {
    if (!authorshipSettings(context.collection.definition)[path]) fail('forbidden');
    if (!context.queryableFields.includes(path)) fail('forbidden');
  }
  const column = Object.hasOwn(metadataColumns, path) ? metadataColumns[path] : undefined;
  return column ? `${context.documentAlias}.${identifier(column)}` : undefined;
}
function localePredicate(field: FieldMapping, name: string, context: QueryContext): string {
  if (!field.localized) return `${name}.locale='_'`;
  const locales = [context.query.locale, ...context.query.fallback];
  const ranked = parameter(context, locales);
  return `${name}.locale=ANY(${ranked}::text[]) AND NOT EXISTS (SELECT 1 FROM ${identifier(field.table)} lp WHERE lp.revision_id=${name}.revision_id AND lp.parent_path=${name}.parent_path AND array_position(${ranked}::text[],lp.locale)<array_position(${ranked}::text[],${name}.locale))`;
}
export function fieldSource(
  field: FieldMapping,
  context: QueryContext,
): { from: string; where: string; name: string } {
  const name = alias(context, 'f');
  const terms = [
    `${name}.revision_id=${context.revisionAlias}.id`,
    localePredicate(field, name, context),
  ];
  let from = `${identifier(field.table)} ${name}`;
  let current = field;
  let childName = name;
  while (current.parent) {
    const { parent } = current;
    const parentName = alias(context, 'p');
    const base = `${parentName}.parent_path || '/${parent.field.id}'`;
    const path =
      parent.field.type === 'group' ? base : `${base} || '/' || ${parentName}.item_id::text`;
    from += ` JOIN ${identifier(parent.table)} ${parentName} ON ${parentName}.revision_id=${childName}.revision_id AND ${childName}.parent_path=${path}`;
    terms.push(
      parent.field.type === 'group'
        ? `${parentName}.state='container'`
        : `${parentName}.state='item'`,
    );
    terms.push(localePredicate(parent, parentName, context));
    if (parent.localized) terms.push(`${childName}.locale=${parentName}.locale`);
    if (current.blockKey)
      terms.push(`${parentName}.block_type=${parameter(context, current.blockKey)}`);
    childName = parentName;
    current = parent;
  }
  terms.push(`${childName}.parent_path='root'`);
  return { from, where: terms.join(' AND '), name };
}
export function requireQueryable(path: string, context: QueryContext): void {
  if (!Object.hasOwn(metadataColumns, path) && !context.queryableFields.includes(path))
    fail('forbidden');
}
export function scalarExpression(field: FieldMapping, context: QueryContext): string {
  if (field.structural || field.field.hasMany || ancestorRepeated(field)) fail('invalid_input');
  const indexed = projectedValue(field, context);
  if (indexed) return indexed.expression;
  const source = fieldSource(field, context);
  return `(SELECT ${source.name}.value FROM ${source.from} WHERE ${source.where} AND ${source.name}.state='value' LIMIT 1)`;
}
function ancestorRepeated(field: FieldMapping): boolean {
  let { parent } = field;
  while (parent) {
    if (parent.field.type === 'array' || parent.field.type === 'blocks') return true;
    ({ parent } = parent);
  }
  return false;
}

export function projectedValue(
  field: FieldMapping,
  context: QueryContext,
): { expression: string; present: string; targetExpression?: string } | undefined {
  if (context.revisionAlias !== 'r') return undefined;
  const index = context.collection.indexes.find((candidate) =>
    candidate.fields.some((item) => item.identityPath === field.identityPath),
  );
  if (!index) return undefined;
  let names = context.indexAliases.get(index.table);
  if (!names) {
    names = [context.query.locale, ...context.query.fallback].map((locale) => {
      const name = alias(context, 'ci');
      context.joins.set(
        name,
        `LEFT JOIN ${identifier(index.table)} ${name} ON ${name}.revision_id=${context.revisionAlias}.id AND ${name}.locale=${parameter(context, locale)}`,
      );
      return name;
    });
    context.indexAliases.set(index.table, names);
  }
  const position = index.fields.findIndex((item) => item.identityPath === field.identityPath);
  const expression = (column: string) =>
    names.length === 1
      ? `${names[0]}.${column}`
      : `(CASE ${names.map((name) => `WHEN (${name}.p${position} OR ${name}.b${position}) THEN ${name}.${column}`).join(' ')} END)`;
  return {
    expression: expression(`k${position}`),
    present:
      names.length === 1
        ? `COALESCE(${names[0]}.p${position},false)`
        : `COALESCE(${expression(`p${position}`)},false)`,
    ...(field.columnType === 'uuid' ? { targetExpression: expression(`c${position}`) } : {}),
  };
}
export function trustedContext(context: QueryContext): QueryContext {
  return {
    ...context,
    query: {
      ...context.query,
      ...targetReadContext({
        collection: context.collection.definition,
        locale: context.query.locale,
      }),
    },
    indexAliases: new Map(),
    queryableFields: [
      ...context.collection.flat.map((field) => field.path),
      ...Object.entries(authorshipSettings(context.collection.definition))
        .filter(([, enabled]) => enabled)
        .map(([field]) => field),
    ],
    relationScopes: context.relationScopes.map((scope) => {
      const target = context.mapping.get(scope.collection);
      return {
        ...scope,
        ...targetReadContext({ collection: target.definition, locale: scope.locale }),
        queryableFields: [
          ...target.flat.map((field) => field.path),
          ...Object.entries(authorshipSettings(target.definition))
            .filter(([, enabled]) => enabled)
            .map(([field]) => field),
        ],
      };
    }),
  };
}
