import { filteredChoices } from '../fields/filtered-choices.ts';
import { dataFieldInstances } from '../fields/structure.ts';
import { functionScope } from '../hooks/invoke.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData, FieldOption } from '../definition.ts';
import type { EditorNode } from './contracts.ts';

function nodeIds(layout: readonly EditorNode[]): string[] {
  return layout.flatMap((node) => [
    node.id,
    ...nodeIds(node.children ?? []),
    ...(node.blocks ?? []).flatMap((block) => nodeIds(block.children)),
    ...(node.tabs ?? []).flatMap((tab) => nodeIds(tab.children)),
  ]);
}

export async function editorChoiceOptions(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    layout: readonly EditorNode[];
    data: DocumentData;
    documentId?: string;
  },
): Promise<{ choiceOptions?: Record<string, FieldOption[]> }> {
  const permitted = new Set(nodeIds(input.layout));
  const result: Record<string, FieldOption[]> = {};
  for (const { field, path } of dataFieldInstances({
    fields: state.collection.fields,
    data: input.data,
  })) {
    if (!permitted.has(field.id)) continue;
    const options = await filteredChoices({
      field,
      path,
      data: input.data,
      locale: state.locale,
      collection: state.collection.key,
      mode: state.mode,
      limits: input.runtime.limits,
      functions: functionScope(state),
      ...(input.documentId ? { documentId: input.documentId } : {}),
    });
    if (options) result[`${path}#${field.id}`] = options;
  }
  return Object.keys(result).length > 0 ? { choiceOptions: result } : {};
}
