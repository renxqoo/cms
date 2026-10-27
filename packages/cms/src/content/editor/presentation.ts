import { editorSourceData } from './candidate-values.ts';
import { editorComponentVersions } from './component-versions.ts';
import { collectionComponentBindings, editorComponentBindings } from './component-bindings.ts';
import { resolveComponentProps } from './component-props.ts';
import { editorChoiceOptions } from './choice-options.ts';
import { projectReadData } from '../documents/project-data.ts';
import { editorInitialData } from './initial-data.ts';
import { editorVisibility } from './conditions.ts';
import { initialSnapshot } from './initial-snapshot.ts';
import type { ContentRuntime } from '../types.ts';
import type { FieldDefinition } from '../definition.ts';
import type { EditorContext } from './context.ts';
import type { EditorNode } from './contracts.ts';

export async function editorPresentation(
  context: EditorContext,
  input: {
    runtime: ContentRuntime;
    fields: readonly FieldDefinition[];
    layout: readonly EditorNode[];
  },
) {
  const initialData = await editorInitialData(context, input);
  const source = context.document
    ? await projectReadData(context.reader, {
        runtime: input.runtime,
        documentId: context.document.id,
        data: context.data ?? {},
      })
    : (initialData ?? {});
  const data = editorSourceData(context, source);
  const visibility = await editorVisibility(context.selected, {
    runtime: input.runtime,
    layout: input.layout,
    data,
  });
  const bindings = [
    ...collectionComponentBindings(context.state.collection, 'document'),
    ...editorComponentBindings({ layout: input.layout, data, visibility }),
  ];
  return {
    ...(await editorChoiceOptions(context.selected, {
      runtime: input.runtime,
      layout: input.layout,
      data,
      ...(context.document ? { documentId: context.document.id } : {}),
    })),
    componentProps: await resolveComponentProps(context.selected, {
      runtime: input.runtime,
      bindings,
      data,
      ...(context.document ? { documentId: context.document.id } : {}),
    }),
    dynamicComponentProps: hasDynamicComponentProps(context, input),
    initialData,
    initialSnapshot:
      initialData === null ? null : initialSnapshot(context.selected, input.runtime, initialData),
    visibility,
  };
}

function hasDynamicComponentProps(
  context: EditorContext,
  input: { runtime: ContentRuntime; layout: readonly EditorNode[] },
) {
  const versions = editorComponentVersions(input.runtime, context.state.collection, input.layout);
  return input.runtime.registry.adminComponents.some(
    (registration) =>
      (registration.resolveProps ?? registration.validateProps) &&
      Object.hasOwn(versions, registration.id),
  );
}
