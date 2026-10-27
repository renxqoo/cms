import { fail } from '@new-cms/cms/platform/contracts';
import type { AssetsParticipants } from '@new-cms/cms/assets/composition';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { authorizeStateOperation, collectionPredicate } from '../runtime.ts';
import { denied, targetState } from './relation-scopes.ts';
import type { ContentDocumentView, ContentRuntime, ContentState } from '../types.ts';
import { visibleDocuments } from './visible-documents.ts';
import { selectRevisionBindings } from './media-bindings.ts';
import type { Where } from '../definition.ts';

type Binding = Awaited<ReturnType<AssetsParticipants['listRevisionBindings']>>[number];
interface Projection {
  runtime: ContentRuntime;
  bindings: readonly Binding[];
  access: ReadonlySet<string>;
  locales: readonly string[];
  schemaVersions: ReadonlyMap<string, number>;
}

async function mediaAccess(
  state: ContentState,
  input: { runtime: ContentRuntime; bindings: readonly Binding[] },
): Promise<Set<string>> {
  const access = new Set<string>();
  for (const collection of new Set(input.bindings.map((binding) => binding.mediaCollectionKey))) {
    try {
      const reader = await targetState(
        { ...state, mode: 'editing' },
        { runtime: input.runtime, collection },
      );
      const actor = await authorizeStateOperation(reader, {
        runtime: input.runtime,
        operationId: 'assets.download',
        collection,
      });
      if (!actor) fail('unauthenticated');
      const policy = await collectionPredicate({
        ...reader,
        actor,
        operationId: 'assets.download',
      });
      const predicates = [reader.predicate, policy].filter(
        (item): item is Where => item !== undefined,
      );
      const { predicate: _old, ...base } = reader;
      const target = {
        ...base,
        ...(predicates.length > 0 ? { predicate: { and: predicates } } : {}),
      };
      const ids = input.bindings
        .filter((binding) => binding.mediaCollectionKey === collection)
        .map((binding) => binding.mediaDocumentId);
      const visible = await visibleDocuments(target, {
        runtime: input.runtime,
        ids,
        trashed: false,
      });
      for (const id of visible.keys()) access.add(`${collection}:${id}`);
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return access;
}

function decorateView(
  state: ContentState,
  input: Projection & { view: ContentDocumentView },
): void {
  input.view.mediaBindings = [];
  const schemaVersion = input.schemaVersions.get(input.view.versionId);
  if (schemaVersion === undefined) fail('internal_error');
  const bindings = selectRevisionBindings(state, {
    ...input,
    data: input.view.data,
    schemaVersion,
    bindings: input.bindings.filter((item) => item.revisionId === input.view.versionId),
  });
  for (const binding of bindings) {
    if (!input.access.has(`${binding.mediaCollectionKey}:${binding.mediaDocumentId}`)) continue;
    const { revisionId: _revisionId, ...safe } = binding;
    if (binding.sourcePath === '$file') input.view.file = binding.manifest;
    else input.view.mediaBindings.push(safe);
  }
}

export async function decorateDocuments(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    views: ContentDocumentView[];
    fallback?: readonly string[];
    schemaVersions: ReadonlyMap<string, number>;
  },
): Promise<void> {
  if (!input.runtime.assets || input.views.length === 0) return;
  const bindings = await input.runtime.assets.listRevisionBindings(state.tx, {
    revisionIds: input.views.map((view) => view.versionId),
  });
  const projection = {
    runtime: input.runtime,
    schemaVersions: input.schemaVersions,
    bindings,
    access: await mediaAccess(state, { runtime: input.runtime, bindings }),
    locales: [
      state.locale,
      ...targetReadContext({
        collection: state.collection,
        locale: state.locale,
        ...((input.fallback ?? state.fallbackOverride)
          ? { fallback: input.fallback ?? state.fallbackOverride }
          : {}),
      }).fallback,
    ],
  };
  for (const view of input.views) decorateView(state, { ...projection, view });
}
