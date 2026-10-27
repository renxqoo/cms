import { requestApi } from '../../api/client';
import { failure } from '../../api/result';
import { editorPreviewSchema } from '../../contracts/editor';
import type { EditorSnapshot } from './editor-read';
import type { FieldData } from '../fields/types';
import { editorCandidate } from './editor-candidate';

export async function previewEditor(
  input: { snapshot: EditorSnapshot; data: FieldData },
  signal: AbortSignal,
) {
  const { snapshot } = input;
  const { collection, ...body } = editorCandidate(snapshot, input.data);
  const result = await requestApi({
    operation: 'collections.previewEditor',
    params: { collection },
    body,
    response: editorPreviewSchema,
    signal,
  });
  if (result.ok && result.data.behaviorHash !== snapshot.editor.behaviorHash)
    return failure('version_conflict', 409);
  return result;
}
