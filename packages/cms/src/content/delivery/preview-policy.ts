import { policyScope } from '../hooks/invoke.ts';
import { isDeepStrictEqual } from 'node:util';
import { fail } from '@new-cms/cms/platform/contracts';
import { projectData } from '../fields/policy-read.ts';
import { policyContext } from '../runtime.ts';
import type { DocumentData } from '../definition.ts';
import type { ContentState } from '../types.ts';

export async function assertCompletePreviewRead(
  state: ContentState,
  data: DocumentData,
): Promise<void> {
  const readable = await projectData({
    ...policyScope(state),
    collection: state.collection,
    data,
    context: policyContext(state, data),
  });
  if (!isDeepStrictEqual(readable, data)) fail('forbidden');
}
