import { z } from 'zod';
import { authorField, filterFields } from './author-metadata';
import type { Collection, CollectionField } from '../../contracts/content';
import type { JsonValue } from '../fields/types';
import { isFieldData } from '../fields/data';
import { isJsonValue } from '../fields/parsing';

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'all'
  | 'like'
  | 'notLike'
  | 'near'
  | 'within'
  | 'intersects';
export type FilterWhere =
  | { and: FilterWhere[] }
  | { or: FilterWhere[] }
  | { field: string; operator: FilterOperator; value: JsonValue };
export type FilterDraft =
  | { kind: 'group'; join: 'and' | 'or'; children: FilterDraft[] }
  | { kind: 'condition'; field: string; operator: FilterOperator; value: string };
export interface DocumentSort {
  field: string;
  order: 'asc' | 'desc';
}

export function filterOperators(field: CollectionField | undefined): FilterOperator[] {
  if (!field) return ['eq'];
  if (authorField(field)) return ['eq', 'ne', 'in', 'notIn', 'exists'];
  if (['group', 'array', 'blocks'].includes(field.type)) return ['exists'];
  const common: FilterOperator[] = ['eq', 'ne', 'in', 'notIn', 'all', 'exists'];
  if (field.type === 'point') return ['eq', 'ne', 'exists', 'near', 'within', 'intersects'];
  if (['relationship', 'upload', 'boolean', 'json'].includes(field.type)) return common;
  const ordered: FilterOperator[] = [...common, 'gt', 'gte', 'lt', 'lte'];
  return ['number', 'date'].includes(field.type)
    ? ordered
    : [...ordered, 'contains', 'like', 'notLike'];
}

function scalar(value: unknown, field: CollectionField): boolean {
  if (value === null) return true;
  if (authorField(field)) return z.uuid().safeParse(value).success;
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (['point', 'relationship', 'upload', 'json'].includes(field.type))
    return typeof value === 'object';
  return typeof value === 'string';
}

function validCondition(raw: Record<string, JsonValue>, collection: Collection | null): boolean {
  const field = collection
    ? filterFields(collection).find(
        (candidate) => candidate.path === raw['field'] && candidate.queryable,
      )
    : undefined;
  const { operator, value } = raw;
  if (
    !field ||
    typeof operator !== 'string' ||
    Object.keys(raw).length !== 3 ||
    !filterOperators(field).some((entry) => entry === operator)
  )
    return false;
  if (operator === 'exists') return typeof value === 'boolean';
  if (['in', 'notIn', 'all'].includes(operator))
    return Array.isArray(value) && value.length > 0 && value.every((entry) => scalar(entry, field));
  if (['near', 'within', 'intersects'].includes(operator))
    return value !== null && typeof value === 'object';
  return scalar(value, field);
}

export function validateFilter(
  value: unknown,
  collection: Collection | null,
): value is FilterWhere {
  let count = 0;
  function visit(node: unknown, depth: number): boolean {
    if (++count > 100 || depth > 8 || !isFieldData(node)) return false;
    const raw = node;
    if ('and' in raw || 'or' in raw) {
      const entries = raw['and'] ?? raw['or'];
      return (
        Object.keys(raw).length === 1 &&
        Array.isArray(entries) &&
        entries.length > 0 &&
        entries.every((entry) => visit(entry, depth + 1))
      );
    }
    return validCondition(raw, collection);
  }
  return visit(value, 1);
}

export function parseFilterValue(
  value: string,
  operator: FilterOperator,
  field: CollectionField,
): JsonValue {
  if (
    operator === 'exists' ||
    ['in', 'notIn', 'all', 'near', 'within', 'intersects'].includes(operator) ||
    ['point', 'relationship', 'upload', 'json', 'boolean'].includes(field.type)
  ) {
    const parsed: unknown = JSON.parse(value);
    if (!isJsonValue(parsed)) throw new Error('Invalid value');
    return parsed;
  }
  if (field.type === 'number') {
    if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Invalid number');
    return Number(value);
  }
  return value;
}

export function draftFilter(node: FilterWhere | undefined): FilterDraft {
  if (!node) return { kind: 'group', join: 'and', children: [] };
  if ('and' in node || 'or' in node)
    return {
      kind: 'group',
      join: 'and' in node ? 'and' : 'or',
      children: ('and' in node ? node.and : node.or).map(draftFilter),
    };
  return {
    kind: 'condition',
    field: node.field,
    operator: node.operator,
    value:
      typeof node.value === 'string' && !['in', 'notIn', 'all', 'exists'].includes(node.operator)
        ? node.value
        : JSON.stringify(node.value),
  };
}

export function filterFromDraft(
  draft: FilterDraft,
  collection: Collection,
): FilterWhere | undefined {
  if (draft.kind === 'group') {
    if (draft.children.length === 0) return undefined;
    const children = draft.children.map((child) => {
      const result = filterFromDraft(child, collection);
      if (!result) throw new Error('Empty group');
      return result;
    });
    if (children.length === 1) return children[0];
    return draft.join === 'and' ? { and: children } : { or: children };
  }
  const field = filterFields(collection).find(
    (candidate) => candidate.path === draft.field && candidate.queryable,
  );
  if (!field) throw new Error('Unknown field');
  return {
    field: draft.field,
    operator: draft.operator,
    value: parseFilterValue(draft.value, draft.operator, field),
  };
}
