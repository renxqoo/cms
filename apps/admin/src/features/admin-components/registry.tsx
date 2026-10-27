'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { builtinAdminComponents } from './builtins';
import { componentReferences, componentId } from './component-reference';
import { componentValue } from './component-value';
import type { AdminComponentRegistry, FieldComponentSlot, CollectionComponentSlot } from './types';
import type { Collection } from '../../contracts/content';
import type { CollectionEditor, EditorNode } from '../../contracts/editor';

const Registry = createContext<AdminComponentRegistry>(builtinAdminComponents);

export function AdminComponentsProvider({
  registry,
  children,
}: {
  registry: AdminComponentRegistry;
  children: ReactNode;
}) {
  return <Registry.Provider value={registry}>{children}</Registry.Provider>;
}

export function useAdminComponents(): AdminComponentRegistry {
  return useContext(Registry);
}

function fieldSlot(value: string): value is FieldComponentSlot {
  return [
    'Field',
    'Label',
    'Description',
    'Error',
    'beforeInput',
    'afterInput',
    'Filter',
    'Diff',
    'RowLabel',
    'Block',
  ].some((slot) => slot === value);
}
function collectionSlot(value: string): value is CollectionComponentSlot {
  return [
    'Header',
    'List',
    'Edit',
    'Description',
    'beforeList',
    'afterList',
    'beforeEdit',
    'afterEdit',
    'beforeListTable',
    'afterListTable',
    'listMenuItems',
    'ListActions',
    'NoResults',
    'beforeDocumentControls',
    'BeforeDocumentMeta',
    'editMenuItems',
    'PreviewButton',
    'PublishButton',
    'SaveButton',
    'SaveDraftButton',
    'Status',
    'UnpublishButton',
    'Upload',
    'View',
    'ViewActions',
    'Icon',
    'SmallIcon',
  ].some((slot) => slot === value);
}
function versionMatches(
  id: string,
  registry: AdminComponentRegistry,
  versions: Readonly<Record<string, string>>,
): boolean {
  const expected = componentValue(versions, id);
  return (
    expected !== undefined &&
    expected.length > 0 &&
    componentValue(registry.versions, id) === expected
  );
}
function fieldAvailable(
  node: EditorNode,
  registry: AdminComponentRegistry,
  versions: Readonly<Record<string, string>>,
): boolean {
  for (const [slot, value] of Object.entries(node.components ?? {})) {
    const identifiers = componentReferences(value).flatMap((reference) => {
      const id = componentId(reference);
      return id ? [id] : [];
    });
    if (slot === 'Cell') {
      if (
        !identifiers.every(
          (id) => componentValue(registry.cells, id) && versionMatches(id, registry, versions),
        )
      )
        return false;
      continue;
    }
    if (
      !fieldSlot(slot) ||
      !identifiers.every(
        (id) => componentValue(registry.fields[slot], id) && versionMatches(id, registry, versions),
      )
    )
      return false;
  }
  return (
    (node.children ?? []).every((child) => fieldAvailable(child, registry, versions)) &&
    (node.blocks ?? []).every((block) =>
      fieldAvailable(
        {
          ...node,
          id: block.id,
          components: block.components ?? {},
          children: block.children,
          blocks: [],
          tabs: [],
        },
        registry,
        versions,
      ),
    ) &&
    (node.tabs ?? []).every((tab) =>
      tab.children.every((child) => fieldAvailable(child, registry, versions)),
    )
  );
}

export function fieldComponentsAvailable(
  editor: Pick<CollectionEditor, 'layout' | 'componentVersions'>,
  registry: AdminComponentRegistry = builtinAdminComponents,
): boolean {
  return (
    Object.entries(editor.componentVersions).every(
      ([id, version]) => componentValue(registry.versions, id) === version,
    ) && editor.layout.every((node) => fieldAvailable(node, registry, editor.componentVersions))
  );
}

export function editorComponentsAvailable(
  collection: Collection,
  editor: CollectionEditor,
  registry: AdminComponentRegistry = builtinAdminComponents,
): boolean {
  if (!fieldComponentsAvailable(editor, registry)) return false;
  const configured = [
    collection.admin?.components,
    collection.hierarchy?.components,
    ...(collection.admin?.views ?? []).map((view) => ({
      View: view.component,
      ViewActions: view.actions,
    })),
  ];
  for (const [slot, value] of configured.flatMap((components) =>
    Object.entries(components ?? {}),
  )) {
    const identifiers = componentReferences(value).flatMap((reference) => {
      const id = componentId(reference);
      return id ? [id] : [];
    });
    if (
      !collectionSlot(slot) ||
      !identifiers.every(
        (id) =>
          componentValue(registry.collections[slot], id) &&
          versionMatches(id, registry, editor.componentVersions),
      )
    )
      return false;
  }
  return true;
}

export type {
  AdminComponentRegistry,
  FieldComponentProps,
  CellComponentProps,
  CollectionComponentProps,
} from './types';
