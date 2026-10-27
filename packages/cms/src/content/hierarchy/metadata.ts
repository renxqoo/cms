import { hierarchySettings } from '../collections/hierarchy-config.ts';
import { fieldPaths } from '../fields/structure.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export function hierarchyMetadata(
  state: ContentState,
  input: { runtime: ContentRuntime; visible: ReadonlySet<string> },
) {
  const options = hierarchySettings(state.collection);
  if (!options || !input.visible.has(options.parentFieldName)) return null;
  return {
    kind: options.kind,
    ...(options.admin.components ? { components: options.admin.components } : {}),
    parentFieldName: options.parentFieldName,
    ...(input.visible.has(options.slugPathFieldName)
      ? { slugPathFieldName: options.slugPathFieldName }
      : {}),
    ...(input.visible.has(options.titlePathFieldName)
      ? { titlePathFieldName: options.titlePathFieldName }
      : {}),
    ...(options.collectionSpecific && input.visible.has(options.collectionSpecific.fieldName)
      ? { typeFieldName: options.collectionSpecific.fieldName }
      : {}),
    allowHasMany: options.allowHasMany,
    treeLimit: options.admin.treeLimit ?? input.runtime.limits.defaultPageSize,
    useHeaderButton: options.admin.useHeaderButton,
    injectSidebarTab: options.admin.injectSidebarTab,
    relatedCollections: input.runtime.registry.list.flatMap((collection) =>
      fieldPaths(collection.fields)
        .filter(
          ({ field }) =>
            collection.key !== state.collection.key &&
            field.relationTo?.includes(state.collection.key),
        )
        .map(({ path, field }) => ({
          collection: collection.key,
          field: path,
          hasMany: field.hasMany === true,
        })),
    ),
  };
}
