import { fieldPaths } from '../fields/structure.ts';
import type { DeliverySession } from './types.ts';
import { collectionFor } from './source.ts';

export const modelCardFields = [
  'modelId',
  'slug',
  'title',
  'summary',
  'primaryCategory',
  'contentLocales',
  'developer',
  'family',
  'version',
  'versionKind',
  'releaseDate',
  'officialUrl',
  'technicalCapabilities',
  'specifications',
  'apiBindings.key',
  'presentation.featured',
  'presentation.sortOrder',
  'logo',
  'seo',
] as const;
export const documentNavigationFields = ['slug', 'title', 'navigationLabel', 'order'] as const;
export async function readProjection(
  session: DeliverySession,
  collection: string,
  requested: readonly string[],
): Promise<string[]> {
  const definition = await collectionFor(session, collection);
  const paths = new Set(fieldPaths(definition.fields).map((entry) => entry.path));
  return requested.filter((path) => paths.has(path));
}
