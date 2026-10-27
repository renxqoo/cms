import { fail } from '@new-cms/cms/platform/contracts';
import { allFieldDefinitions } from '../fields/structure.ts';
import type { CollectionDefinition, ContentLimits } from '../definition.ts';

function hookCount(hooks: object | undefined): number {
  const values: unknown[] = Object.values(hooks ?? {});
  return values.reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : 0),
    0,
  );
}
export function validateHooks(collection: CollectionDefinition, limits: ContentLimits): void {
  const count =
    hookCount(collection.hooks) +
    allFieldDefinitions(collection.fields).reduce(
      (total, field) => total + hookCount(field.hooks) + (field.admin?.condition ? 1 : 0),
      0,
    );
  if (count > limits.maxFields) fail('invalid_input');
}
