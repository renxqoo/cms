import { fail } from '@new-cms/cms/platform/contracts';
import type { AssetsParticipants } from '@new-cms/cms/assets/composition';
import { targetReadContext } from '../queries/resolve-locale.ts';
import { historicalLocale } from '../fields/remap-locale.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import { collectReferences } from '../fields/collect-references.ts';
import { authorizeStateOperation, collectionPredicate } from '../runtime.ts';
import { denied, targetState } from './relation-scopes.ts';
import type { ContentDocumentView, ContentRuntime, ContentState } from '../types.ts';
import { visibleDocuments } from './visible-documents.ts';
import type { Where, ReferenceValue } from '../definition.ts';

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
      const policy = collectionPredicate({ ...reader, actor, operationId: 'assets.download' });
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

function bindingLocation(
  state: ContentState,
  input: { binding: Binding; runtime: ContentRuntime; schemaVersion: number },
) {
  const { binding } = input;
  const separator = binding.sourcePath.indexOf(':');
  const rawPath = separator >= 0 ? binding.sourcePath.slice(separator + 1) : binding.sourcePath;
  const path =
    rawPath === '$file'
      ? rawPath
      : remapReferencePath({
          from: input.runtime.store.definition(state.collection.key, input.schemaVersion),
          to: state.collection,
          path: rawPath,
        });
  return { locale: separator >= 0 ? binding.sourcePath.slice(0, separator) : state.locale, path };
}

function bindingIsVisible(
  binding: Binding,
  input: {
    locale: string;
    path: string;
    locales: readonly string[];
    visible: Map<string, ReferenceValue>;
  },
): boolean {
  if (input.path === '$file') return true;
  const reference = input.visible.get(input.path);
  return (
    input.locales.includes(input.locale) &&
    reference !== undefined &&
    reference.id === binding.mediaDocumentId &&
    reference.collection === binding.mediaCollectionKey
  );
}

function decorateView(
  state: ContentState,
  input: Projection & { view: ContentDocumentView },
): void {
  const references = collectReferences({
    limits: input.runtime.limits,
    collection: state.collection,
    data: input.view.data,
    locale: state.locale,
  }).filter((reference) => reference.media);
  const visible = new Map(references.map((reference) => [reference.path, reference]));
  input.view.mediaBindings = [];
  const schemaVersion = input.schemaVersions.get(input.view.versionId);
  if (schemaVersion === undefined) fail('internal_error');
  for (const binding of input.bindings.filter((item) => item.revisionId === input.view.versionId)) {
    const location = bindingLocation(state, { binding, runtime: input.runtime, schemaVersion });
    const locales = input.locales
      .map((locale) => historicalLocale({ current: state.collection, schemaVersion, locale }))
      .filter((locale): locale is string => locale !== null);
    if (!bindingIsVisible(binding, { ...location, locales, visible })) continue;
    const key = `${binding.mediaCollectionKey}:${binding.mediaDocumentId}`;
    if (!input.access.has(key)) continue;
    const { revisionId: _revisionId, ...safe } = binding;
    if (location.path === '$file') input.view.file = binding.manifest;
    else if (
      !input.view.mediaBindings.some(
        (item) => item.sourcePath.slice(item.sourcePath.indexOf(':') + 1) === location.path,
      )
    )
      input.view.mediaBindings.push(safe);
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
