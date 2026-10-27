import { policyScope } from './invoke.ts';
import { projectData } from '../fields/policy-read.ts';
import { hierarchyReadData } from '../hierarchy/read-paths.ts';
import { transformReadData } from './read-transform.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

export async function hookReadData(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    data: DocumentData;
    policyData?: DocumentData;
    documentId?: string;
    select?: readonly string[];
  },
): Promise<DocumentData> {
  const transformed = await transformReadData(state, input);
  const data = input.documentId
    ? await hierarchyReadData(state, {
        runtime: input.runtime,
        data: transformed,
        policyData: input.policyData ?? input.data,
        documentId: input.documentId,
      })
    : transformed;
  return await projectData({
    ...policyScope(state),
    collection: state.collection,
    data,
    policyData: input.policyData ?? input.data,
    context: {
      actor: state.actor,
      operation: state.operationId,
      collectionKey: state.collection.key,
      locale: state.locale,
      mode: state.mode,
      ...(input.documentId ? { documentId: input.documentId } : {}),
    },
    ...(input.select ? { select: input.select } : {}),
  });
}
