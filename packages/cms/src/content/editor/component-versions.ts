import { collectionComponentBindings } from './component-bindings.ts';
import { registeredComponentVersions } from '../collections/admin-components.ts';
import type { CollectionDefinition } from '../definition.ts';
import type { ContentRuntime } from '../types.ts';
import type { EditorNode } from './contracts.ts';

function components(layout: readonly EditorNode[]): (object | undefined)[] {
  return layout.flatMap((node) => [
    node.components,
    ...components(node.children ?? []),
    ...(node.blocks ?? []).flatMap((block) => [block.components, ...components(block.children)]),
    ...(node.tabs ?? []).flatMap((tab) => components(tab.children)),
  ]);
}

export function editorComponentVersions(
  runtime: ContentRuntime,
  collection: CollectionDefinition,
  layout: readonly EditorNode[],
): Record<string, string> {
  return registeredComponentVersions(runtime.registry.adminComponents, [
    ...collectionComponentBindings(collection).map((binding) => ({
      [binding.slot]: binding.reference,
    })),
    ...components(layout),
  ]);
}
