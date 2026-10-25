import type { ContentRuntime, ContentState } from '../types.ts';
import { insertJob } from './store.ts';

export async function enqueueExtensionWork(
  state: ContentState,
  input: { runtime: ContentRuntime; documentId: string; revisionId: string },
): Promise<void> {
  for (const extension of state.collection.extensions ?? []) {
    if (!extension.afterCommit) continue;
    await insertJob(state, {
      runtime: input.runtime,
      action: 'extension',
      documentId: input.documentId,
      versionId: input.revisionId,
      handlerName: extension.afterCommit,
      sourceOperation: state.operationId,
    });
  }
}
