import { fail } from '@new-cms/cms/platform/contracts';
import { referencesForLocale } from './revision-data.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';
import type { RevisionMediaSources } from './bind-assets.ts';

function originalPath(path: string, paths: Readonly<Record<string, string>>) {
  const match = Object.keys(paths).find((key) => path === key || path.startsWith(`${key}.`));
  return match ? `${paths[match]}${path.slice(match.length)}` : undefined;
}
export function localeMediaSources(
  state: Pick<ContentState, 'collection' | 'locale'>,
  input: {
    runtime: Pick<ContentRuntime, 'limits'>;
    source: DocumentData;
    patch: DocumentData;
    fromLocale: string;
    paths: Readonly<Record<string, string>>;
  },
): RevisionMediaSources {
  const references = (data: DocumentData, locale: string) =>
    referencesForLocale({
      collection: state.collection,
      data,
      locale,
      limits: input.runtime.limits,
    }).filter((reference) => reference.media);
  const source = new Map(
    references(input.source, input.fromLocale).map((reference) => [reference.path, reference]),
  );
  const result: Record<string, { path: string; mediaDocumentId: string }> = {};
  for (const reference of references(input.patch, state.locale)) {
    const raw = reference.path.slice(state.locale.length + 1);
    const previous = originalPath(raw, input.paths);
    if (previous === undefined) fail('not_found');
    const path = `${input.fromLocale}:${previous}`;
    const original = source.get(path);
    if (original?.id !== reference.id || original.collection !== reference.collection)
      fail('not_found');
    result[reference.path] = { path, mediaDocumentId: reference.id };
  }
  return result;
}
