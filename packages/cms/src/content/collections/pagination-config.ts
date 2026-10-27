import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, ContentLimits } from '../definition.ts';

export function validatePagination(collection: CollectionDefinition, limits: ContentLimits): void {
  const pagination = collection.admin?.pagination;
  if (pagination) {
    const values = [
      ...(pagination.limits ?? []),
      ...(pagination.defaultLimit ? [pagination.defaultLimit] : []),
    ];
    if (!values.every((value) => value <= limits.maxPageSize)) fail('invalid_input');
    if (new Set(pagination.limits).size !== (pagination.limits?.length ?? 0)) fail('invalid_input');
  }
}
