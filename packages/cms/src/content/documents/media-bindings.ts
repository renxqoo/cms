import type { AssetsParticipants } from '@new-cms/cms/assets/composition';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import { historicalLocale } from '../fields/remap-locale.ts';
import { remapReferencePath } from '../fields/remap-reference-path.ts';
import { collectReferences } from '../fields/collect-references.ts';

type Binding = Awaited<ReturnType<AssetsParticipants['listRevisionBindings']>>[number];

export function selectRevisionBindings(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    data: DocumentData;
    schemaVersion: number;
    bindings: readonly Binding[];
    locales: readonly string[];
  },
): Binding[] {
  const locales = input.locales.map((locale) =>
    historicalLocale({ current: state.collection, schemaVersion: input.schemaVersion, locale }),
  );
  const references = new Map(
    collectReferences({
      collection: state.collection,
      data: input.data,
      locale: state.locale,
      limits: input.runtime.limits,
    })
      .filter((reference) => reference.media)
      .map((reference) => [reference.path, reference]),
  );
  const candidates = orderedBindings(state, { ...input, locales });
  const selected = new Map<string, Binding>();
  for (const { binding, path } of candidates) {
    if (selected.has(path)) continue;
    const reference = references.get(path);
    if (
      path !== '$file' &&
      (reference?.id !== binding.mediaDocumentId ||
        reference.collection !== binding.mediaCollectionKey)
    )
      continue;
    selected.set(path, binding);
  }
  return [...selected.values()];
}

function orderedBindings(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    schemaVersion: number;
    bindings: readonly Binding[];
    locales: readonly (string | null)[];
  },
) {
  const { locales } = input;
  return input.bindings
    .map((binding) => {
      const separator = binding.sourcePath.indexOf(':');
      const locale = separator >= 0 ? binding.sourcePath.slice(0, separator) : locales[0];
      const rawPath = separator >= 0 ? binding.sourcePath.slice(separator + 1) : binding.sourcePath;
      const path =
        rawPath === '$file'
          ? rawPath
          : remapReferencePath({
              from: input.runtime.store.definition(state.collection.key, input.schemaVersion),
              to: state.collection,
              path: rawPath,
            });
      return {
        binding,
        path,
        priority: locale === null || locale === undefined ? -1 : locales.indexOf(locale),
      };
    })
    .filter((item) => item.priority >= 0)
    .toSorted((left, right) => left.priority - right.priority);
}
