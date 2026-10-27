import type { JoinDefinition } from './definition.ts';
import type { CollectionDefinition, ContentLimits, FieldDefinition } from '../definition.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { fieldPaths } from '../fields/structure.ts';
import { assertWhereBudget } from '../queries/parse-query.ts';

export function joinCollections(join: JoinDefinition): readonly string[] {
  return typeof join.collection === 'string' ? [join.collection] : join.collection;
}

export function joinOrderScope(collectionId: string, field: FieldDefinition): string {
  return `${collectionId}:${field.id}`;
}

export function validateJoinDefinition(
  source: CollectionDefinition,
  field: FieldDefinition,
  input: {
    byKey: ReadonlyMap<string, CollectionDefinition>;
    limits: ContentLimits;
  },
): void {
  const { join } = field;
  if (!join) fail('invalid_input');
  const collections = joinCollections(join);
  if (
    collections.length === 0 ||
    new Set(collections).size !== collections.length ||
    collections.length > input.limits.maxExpandNodes ||
    (join.orderable && collections.length !== 1)
  )
    fail('invalid_input');
  if (
    join.defaultPageSize !== undefined &&
    (join.defaultPageSize < 1 || join.defaultPageSize > input.limits.maxPageSize)
  )
    fail('invalid_input');
  if (join.where) assertWhereBudget(join.where, input.limits);
  validateSort(join, input.limits);
  for (const key of collections) {
    const target = input.byKey.get(key);
    if (!target) fail('invalid_input');
    validateInverse(source.key, join, target);
    validateTargetSort(join, target);
  }
}

function validateInverse(source: string, join: JoinDefinition, target: CollectionDefinition) {
  const inverse = fieldPaths(target.fields).find((item) => item.path === join.field)?.field;
  if (
    !inverse ||
    !['relationship', 'upload'].includes(inverse.type) ||
    !inverse.relationTo?.includes(source)
  )
    fail('invalid_input');
}

function validateSort(join: JoinDefinition, limits: ContentLimits) {
  const sort = join.defaultSort ?? [];
  if (
    sort.length > limits.maxQueryNodes ||
    new Set(sort.map((entry) => entry.field)).size !== sort.length
  )
    fail('invalid_input');
}

function validateTargetSort(join: JoinDefinition, target: CollectionDefinition) {
  for (const entry of join.defaultSort ?? []) {
    if (entry.field === '_order' && (join.orderable || target.orderable)) continue;
    if (['id', 'revision', 'createdAt', 'updatedAt', 'trashedAt', 'folderId'].includes(entry.field))
      continue;
    const candidate = fieldPaths(target.fields).find((item) => item.path === entry.field);
    if (!candidate || candidate.repeated || !sortableJoinField(candidate.field))
      fail('invalid_input');
  }
}

export function sortableJoinField(field: FieldDefinition): boolean {
  return (
    !field.virtual &&
    !field.hasMany &&
    !['array', 'blocks', 'group', 'json', 'richText', 'join', 'point'].includes(field.type)
  );
}
