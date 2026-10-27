import { transformReadData } from '../hooks/read-transform.ts';
import { hookReadData } from '../hooks/read-projection.ts';
import { materializeVirtualData } from '../hooks/virtual-data.ts';
import { immutable } from '../fields/invoke-function.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

export async function projectReadData(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    data: DocumentData;
    documentId: string;
    select?: readonly string[];
  },
): Promise<DocumentData> {
  const projected = await hookReadData(state, {
    ...input,
    policyData: input.data,
    data: await materializeVirtualData(state, input),
  });
  state.readPolicyData ??= new WeakMap();
  state.readPolicyData.set(projected, immutable(input.data));
  return projected;
}

export async function prepareHierarchyNode(
  state: ContentState,
  input: { runtime: ContentRuntime; data: DocumentData; documentId: string },
): Promise<DocumentData> {
  return transformReadData(state, { ...input, data: await materializeVirtualData(state, input) });
}
