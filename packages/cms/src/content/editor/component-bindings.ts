import { adminComponentSlotSchema } from '../collections/admin-components.ts';
import { componentReferences, componentId } from '../collections/admin-component-reference.ts';
import { valueAtPath } from '../documents/data-path.ts';
import { objectValue } from '../fields/json-value.ts';
import type {
  AdminComponentReference,
  AdminCollectionComponentSlot,
  AdminFieldComponentSlot,
} from '../collections/admin-types.ts';
import type { CollectionDefinition, DocumentData } from '../definition.ts';
import type { EditorNode } from './contracts.ts';

export interface ComponentBinding {
  namespace: string;
  slot: AdminCollectionComponentSlot | AdminFieldComponentSlot;
  reference: AdminComponentReference;
  path?: string;
  rowContext?: boolean;
  instance?: number;
}
export function componentBindings(
  namespace: string,
  components: object | undefined,
): ComponentBinding[] {
  return Object.entries(components ?? {}).flatMap(([slot, references]) =>
    componentReferences(references).map((reference, index) => ({
      namespace,
      slot: bindingSlot(slot),
      reference,
      ...(Array.isArray(references) ? { instance: index } : {}),
    })),
  );
}
function bindingSlot(slot: string): ComponentBinding['slot'] {
  return adminComponentSlotSchema.parse(slot);
}
export function collectionComponentBindings(
  collection: CollectionDefinition,
  scope?: 'collection' | 'document',
): ComponentBinding[] {
  const hierarchy = typeof collection.hierarchy === 'object' ? collection.hierarchy : undefined;
  return [
    ...componentBindings('$collection', collection.admin?.components).filter(
      (binding) => scope === undefined || collectionSlotScope(binding.slot, scope),
    ),
    ...componentBindings('$hierarchy', hierarchy?.admin?.components),
    ...(collection.admin?.views ?? [])
      .filter((view) => scope === undefined || view.scope === scope)
      .flatMap((view) =>
        componentBindings(`$view:${view.id}`, { View: view.component, ViewActions: view.actions }),
      ),
  ];
}
export function bindingKey(binding: ComponentBinding): string | undefined {
  const id = componentId(binding.reference);
  return id
    ? `${binding.namespace}:${binding.slot}:${id}${binding.instance === undefined ? '' : `:${binding.instance}`}`
    : undefined;
}
export function editorComponentBindings(input: {
  layout: readonly EditorNode[];
  data: DocumentData;
  visibility: Readonly<Record<string, boolean>>;
  prefix?: string;
}): ComponentBinding[] {
  return input.layout.flatMap((node) => {
    const path = node.name
      ? [input.prefix, node.name].filter(Boolean).join('.')
      : (input.prefix ?? '');
    if (node.disabled?.field || input.visibility[`${path}#${node.id}`] === false) return [];
    const own = componentBindings(`${path}#${node.id}`, node.components)
      .filter((entry) => entry.slot !== 'RowLabel')
      .map((entry) => ({ ...entry, path }));
    return [...own, ...nestedBindings(node, { ...input, path })];
  });
}
function nestedBindings(
  node: EditorNode,
  input: { data: DocumentData; visibility: Readonly<Record<string, boolean>>; path: string },
): ComponentBinding[] {
  if (node.type === 'array' || node.type === 'blocks') {
    const rows = valueAtPath(input.data, input.path);
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      if (!objectValue(row) || typeof row['id'] !== 'string') return [];
      const path = `${input.path}.${row['id']}`;
      const block = node.blocks?.find((entry) => entry.key === row['blockType']);
      return [
        ...componentBindings(`${path}#${node.id}`, { RowLabel: node.components?.RowLabel }).map(
          (entry) => ({ ...entry, path, rowContext: true }),
        ),
        ...componentBindings(`${path}#${block?.id ?? node.id}`, block?.components).map((entry) => ({
          ...entry,
          path,
          rowContext: true,
        })),
        ...editorComponentBindings({
          ...input,
          layout: block?.children ?? node.children ?? [],
          prefix: path,
        }),
      ];
    });
  }
  return [
    ...editorComponentBindings({ ...input, layout: node.children ?? [], prefix: input.path }),
    ...(node.tabs ?? []).flatMap((tab) =>
      editorComponentBindings({
        ...input,
        layout: tab.children,
        prefix: tab.name ? [input.path, tab.name].filter(Boolean).join('.') : input.path,
      }),
    ),
  ];
}

function collectionSlotScope(slot: ComponentBinding['slot'], scope: 'collection' | 'document') {
  const shared = ['Header', 'Description', 'Icon', 'SmallIcon'];
  const list = [
    'List',
    'beforeList',
    'afterList',
    'beforeListTable',
    'afterListTable',
    'listMenuItems',
    'ListActions',
    'NoResults',
  ];
  return (
    shared.includes(slot) || (scope === 'collection' ? list.includes(slot) : !list.includes(slot))
  );
}
