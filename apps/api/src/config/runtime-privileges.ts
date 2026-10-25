import type { ContentMapping } from '@new-cms/cms/content/generate';
import type { RuntimePrivilegeProfile } from '@new-cms/database/privileges';

export function applicationRuntimeProfile(mapping: ContentMapping): RuntimePrivilegeProfile {
  const immutable = new Set(
    mapping.collections.flatMap((collection) => [
      ...collection.flat.map((field) => field.table),
      ...collection.indexes.map((index) => index.table),
    ]),
  );
  return mapping.plan.tables.map(({ name }) => ({
    name,
    privileges: immutable.has(name) ? ['SELECT', 'INSERT'] : ['SELECT', 'INSERT', 'DELETE'],
  }));
}
