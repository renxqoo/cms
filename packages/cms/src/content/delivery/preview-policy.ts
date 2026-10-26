import { isDeepStrictEqual } from 'node:util';
import { fail } from '@new-cms/cms/platform/contracts';
import { projectData } from '../fields/policies.ts';
import { policyContext } from '../runtime.ts';
import type { DocumentData } from '../definition.ts';
import type { ContentState } from '../types.ts';

export function assertCompletePreviewRead(state: ContentState, data: DocumentData): void {
  const readable = projectData({
    collection: state.collection,
    data,
    context: policyContext(state, data),
  });
  if (!isDeepStrictEqual(readable, data)) fail('forbidden');
}
