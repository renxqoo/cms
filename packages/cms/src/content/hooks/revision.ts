import { fieldPaths } from '../fields/structure.ts';
import { observeHooks } from './api.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { DocumentRow } from '../model.ts';

export async function observeRevision(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    documentId: string;
    data: DocumentData;
    previous?: DocumentRow;
  },
): Promise<void> {
  const hooks =
    (state.collection.hooks?.afterChange?.length ?? 0) > 0 ||
    fieldPaths(state.collection.fields).some(
      ({ field }) => (field.hooks?.afterChange?.length ?? 0) > 0,
    );
  if (!hooks) return;
  const previousData = input.previous
    ? await input.runtime.store.readRevisionData(state.tx, {
        collection: state.collection.key,
        documentId: input.documentId,
        versionId: input.previous.currentVersionId,
        locale: state.locale,
        fallback: [],
      })
    : undefined;
  await observeHooks(state, {
    stage: 'afterChange',
    limits: input.runtime.limits,
    context: {
      documentId: input.documentId,
      data: input.data,
      ...(previousData ? { previousData } : {}),
    },
  });
}
