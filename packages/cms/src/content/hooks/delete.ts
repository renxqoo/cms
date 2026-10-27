import { currentData } from '../documents/revision-data.ts';
import { observeHooks } from './api.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentRow } from '../model.ts';
import type { DocumentData } from '../definition.ts';

export async function beforeDelete(
  state: ContentState,
  input: { runtime: ContentRuntime; document: DocumentRow },
): Promise<DocumentData | undefined> {
  if (!state.collection.hooks?.beforeDelete?.length && !state.collection.hooks?.afterDelete?.length)
    return undefined;
  const data = await currentData(state, input);
  await observeHooks(state, {
    stage: 'beforeDelete',
    limits: input.runtime.limits,
    context: { documentId: input.document.id, data },
  });
  return data;
}

export async function afterDelete(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string; data: DocumentData | undefined },
): Promise<void> {
  await observeHooks(state, {
    stage: 'afterDelete',
    limits: input.runtime.limits,
    context: { documentId: input.documentId, ...(input.data ? { data: input.data } : {}) },
  });
}
