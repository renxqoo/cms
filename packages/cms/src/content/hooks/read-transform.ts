import { validateData } from '../fields/validate-data.ts';
import { fieldPaths } from '../fields/structure.ts';
import { transformHooks } from './api.ts';
import { functionScope } from './invoke.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

export async function transformReadData(
  state: ContentState,
  input: { runtime: ContentRuntime; data: DocumentData; documentId?: string },
): Promise<DocumentData> {
  const configured =
    (state.collection.hooks?.afterRead?.length ?? 0) > 0 ||
    fieldPaths(state.collection.fields).some(
      ({ field }) => field.virtual !== undefined || (field.hooks?.afterRead?.length ?? 0) > 0,
    );
  if (!configured) return input.data;
  const transformed = await transformHooks(state, {
    stage: 'afterRead',
    data: input.data,
    limits: input.runtime.limits,
    context: input.documentId ? { documentId: input.documentId } : {},
  });
  return validateData({
    collection: state.collection,
    data: transformed,
    mode: 'draft',
    locale: state.locale,
    limits: input.runtime.limits,
    applyDefaults: false,
    allowVirtual: true,
    functions: functionScope(state),
  });
}
