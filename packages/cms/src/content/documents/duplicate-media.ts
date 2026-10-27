import { referencesForLocale } from './revision-data.ts';
import type { CollectionDefinition } from '../definition.ts';
import type { ContentRuntime } from '../types.ts';
import type { RevisionMediaSources } from './bind-assets.ts';
import type { LocaleData } from './prepare-write.ts';

function originalPath(path: string, paths: Readonly<Record<string, string>>): string {
  const [prefix] = Object.keys(paths)
    .filter((key) => path === key || path.startsWith(`${key}.`))
    .toSorted((a, b) => b.length - a.length);
  return prefix === undefined ? path : `${paths[prefix]}${path.slice(prefix.length)}`;
}
export function duplicateMediaSources(input: {
  collection: CollectionDefinition;
  runtime: Pick<ContentRuntime, 'limits'>;
  source: LocaleData;
  target: LocaleData;
  paths: Readonly<Record<string, string>>;
}): RevisionMediaSources {
  const references = (data: LocaleData) =>
    Object.entries(data)
      .flatMap(([locale, value]) =>
        referencesForLocale({
          collection: input.collection,
          data: value,
          locale,
          limits: input.runtime.limits,
        }),
      )
      .filter((reference) => reference.media);
  const source = new Map(references(input.source).map((reference) => [reference.path, reference]));
  const result: Record<string, { path: string; mediaDocumentId: string }> = {};
  for (const reference of references(input.target)) {
    const path = originalPath(reference.path, input.paths),
      old = source.get(path);
    if (old?.id === reference.id && old.collection === reference.collection)
      result[reference.path] = { path, mediaDocumentId: reference.id };
  }
  return result;
}
