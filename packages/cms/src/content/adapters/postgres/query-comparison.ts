import { z } from 'zod';
import { geoComparison } from './query-geo.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { FieldDefinition, JsonValue, QueryOperator } from '../../definition.ts';
import type { FieldMapping } from '../../model.ts';
import { scalarValue } from '../../fields/scalar.ts';
import { objectValue } from '../../fields/json-value.ts';
import type { QueryContext } from './query-context.ts';
import { parameter } from './query-context.ts';

function validateScalar(
  value: JsonValue,
  field: FieldDefinition,
  context: QueryContext,
): JsonValue {
  if (value === null) return null;
  return scalarValue({ value, field: { ...field, hasMany: false }, limits: context.limits });
}
function relationCompare(input: {
  field: FieldMapping;
  expression: string;
  operator: QueryOperator;
  value: JsonValue;
  context: QueryContext;
  targetExpression?: string;
}): string {
  const { field, expression, operator, value, context } = input;
  const compare = (item: JsonValue) => {
    const parsed = validateScalar(item, field.field, context);
    if (!objectValue(parsed)) fail('invalid_input');
    return `(${expression}=${parameter(context, parsed['id'])}::uuid AND ${input.targetExpression ?? expression.replace(/\.value$/, '.target_collection_id')}=${parameter(context, context.mapping.get(typeof parsed['collection'] === 'string' ? parsed['collection'] : '').definition.id)})`;
  };
  if (operator === 'eq') return compare(value);
  if (operator === 'ne') return `NOT ${compare(value)}`;
  if (
    (operator !== 'in' && operator !== 'notIn') ||
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > context.limits.maxArrayItems
  )
    fail('invalid_input');
  const statement = `(${value.map(compare).join(' OR ')})`;
  return operator === 'notIn' ? `NOT ${statement}` : statement;
}
interface ComparisonInput {
  targetExpression?: string;
  expression: string;
  operator: QueryOperator;
  value: JsonValue;
  field?: FieldMapping;
  context: QueryContext;
}
function setComparison(input: ComparisonInput): string {
  const { expression, operator, value, field, context } = input;
  if (!Array.isArray(value) || value.length === 0 || value.length > context.limits.maxArrayItems)
    fail('invalid_input');
  const values = value.map((item) =>
    parameter(context, field ? validateScalar(item, field.field, context) : item),
  );
  return `${expression} ${operator === 'notIn' ? 'NOT ' : ''}IN (${values.join(',')})`;
}
function containsComparison(input: ComparisonInput): string {
  const { expression, value, field, context } = input;
  if (field?.columnType === 'jsonb')
    return `${expression} @> ${parameter(context, JSON.stringify(value))}::jsonb`;
  if (typeof value !== 'string') fail('invalid_input');
  if (field && field.columnType !== 'text') fail('invalid_input');
  return `${expression} ILIKE ${parameter(context, `%${value.replace(/[\\%_]/g, '\\$&')}%`)} ESCAPE '\\'`;
}
function orderedComparison(input: ComparisonInput): string {
  const { expression, operator, value, field, context } = input;
  if (
    field &&
    ['gt', 'gte', 'lt', 'lte'].includes(operator) &&
    !['text', 'double precision', 'timestamptz'].includes(field.columnType)
  )
    fail('invalid_input');
  const operators: Partial<Record<QueryOperator, string>> = {
    eq: '=',
    ne: '<>',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };
  const token = operators[operator];
  if (!token) fail('invalid_input');
  return `${expression}${token}${parameter(context, field ? validateScalar(value, field.field, context) : value)}`;
}
function wordComparison(input: ComparisonInput): string {
  const { value, field, context } = input;
  if (typeof value !== 'string' || field?.columnType !== 'text' || value.trim().length === 0)
    fail('invalid_input');
  const words = value.trim().split(/\s+/);
  if (words.length > context.limits.maxQueryNodes) fail('invalid_input');
  return `(${words.map((word) => containsComparison({ ...input, value: word })).join(' AND ')})`;
}
const specialComparisons: Partial<Record<QueryOperator, (input: ComparisonInput) => string>> = {
  in: setComparison,
  notIn: setComparison,
  contains: containsComparison,
  like: wordComparison,
  near: geoComparison,
  within: geoComparison,
  intersects: geoComparison,
};
export function comparison(input: ComparisonInput): string {
  const { expression, operator, value, field, context } = input;
  if (operator === 'exists') {
    if (typeof value !== 'boolean') fail('invalid_input');
    return `${expression} IS ${value ? 'NOT ' : ''}NULL`;
  }
  if (field?.structural) fail('invalid_input');
  if (value === null) {
    if (!['eq', 'ne'].includes(operator)) fail('invalid_input');
    return `${expression} IS ${operator === 'ne' ? 'NOT ' : ''}NULL`;
  }
  if (field?.columnType === 'uuid')
    return relationCompare({
      field,
      expression,
      operator,
      value,
      context,
      ...(input.targetExpression ? { targetExpression: input.targetExpression } : {}),
    });
  return (specialComparisons[operator] ?? orderedComparison)(input);
}
const metadataSchemas: Readonly<Record<string, z.ZodType>> = {
  id: z.uuid(),
  createdBy: z.uuid(),
  updatedBy: z.uuid(),
  folderId: z.uuid(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  trashedAt: z.iso.datetime({ offset: true }),
};
export function metadataComparison(input: ComparisonInput & { path: string }): string {
  if (
    ['createdBy', 'updatedBy'].includes(input.path) &&
    !['eq', 'ne', 'in', 'notIn', 'exists'].includes(input.operator)
  )
    fail('invalid_input');
  const values =
    ['in', 'notIn'].includes(input.operator) && Array.isArray(input.value)
      ? input.value
      : [input.value];
  if (
    ['createdBy', 'updatedBy'].includes(input.path) &&
    ['in', 'notIn'].includes(input.operator) &&
    values.includes(null)
  )
    fail('invalid_input');
  if (input.operator !== 'exists')
    for (const value of values) {
      if (value !== null && !metadataSchemas[input.path]?.safeParse(value).success)
        fail('invalid_input');
    }
  return comparison(input);
}
