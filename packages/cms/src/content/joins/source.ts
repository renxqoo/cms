import { fail } from '@new-cms/cms/platform/contracts';
import { ensureVisible, requireAdditionalOperation } from '../runtime.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { readableJoinLocations } from './locations.ts';
import type { ContentState, ContentRuntime } from '../types.ts';

export async function joinSource(
  state: ContentState,
  input: { runtime: ContentRuntime; id: string; fieldId: string },
) {
  const query = parseQuery({
    collection: state.collection,
    limits: input.runtime.limits,
    input: {
      locale: state.locale,
      mode: state.mode,
      ...(state.fallbackOverride ? { fallback: state.fallbackOverride } : {}),
    },
  });
  const reader = await requireAdditionalOperation(state, {
    runtime: input.runtime,
    operationId: 'documents.get',
    id: input.id,
  });
  await ensureVisible(state, { runtime: input.runtime, id: input.id });
  const document = await ensureVisible(reader, { runtime: input.runtime, id: input.id });
  const versionId =
    state.mode === 'published' ? document.publishedVersionId : document.currentVersionId;
  if (!versionId) fail('not_found');
  const data = await input.runtime.store.readRevisionData(state.tx, {
    collection: state.collection.key,
    documentId: document.id,
    versionId,
    locale: query.locale,
    fallback: query.fallback,
  });
  const locations = await readableJoinLocations(reader, {
    data,
    policyData: data,
    documentId: document.id,
  });
  const location = locations.find((entry) => entry.field.id === input.fieldId);
  if (!location?.field.join) fail('not_found');
  return { reader, document, field: location.field, path: location.path };
}
