import { editorChoiceOptions } from './choice-options.ts';
import { collectionComponentBindings, editorComponentBindings } from './component-bindings.ts';
import { resolveComponentProps } from './component-props.ts';
import { editorVisibility } from './conditions.ts';
import { editorLayout } from './layout.ts';
import type { ContentRuntime } from '../types.ts';
import type { EditorCandidateContext } from './candidate-context.ts';

export async function renderEditorCandidate(
  runtime: ContentRuntime,
  candidate: EditorCandidateContext,
) {
  const { layout } = await editorLayout(candidate.context, new Set());
  const visibility = await editorVisibility(candidate.state, {
    runtime,
    data: candidate.data,
    layout,
  });
  return {
    ...(await editorChoiceOptions(candidate.state, {
      runtime,
      data: candidate.data,
      layout,
      ...(candidate.context.document ? { documentId: candidate.context.document.id } : {}),
    })),
    behaviorHash: runtime.registry.behaviorHash,
    visibility,
    componentProps: await resolveComponentProps(candidate.state, {
      runtime,
      data: candidate.data,
      bindings: [
        ...collectionComponentBindings(candidate.state.collection, 'document'),
        ...editorComponentBindings({ layout, data: candidate.data, visibility }),
      ],
      ...(candidate.context.document ? { documentId: candidate.context.document.id } : {}),
    }),
  };
}
