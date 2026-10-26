export const contentPolicy = {
  basePath: '/dashboard/collections',
  pageSize: 20,
  maximumPageSize: 100,
  maximumPage: 2_147_483_647,
  maximumQueryNodes: 50,
  maximumQueryDepth: 8,
  maximumQueryValueDepth: 8,
  maximumQueryValueItems: 1000,
  maximumQueryValueNodes: 8000,
  maximumBatchItems: 100,
  autosaveDelayMs: 1500,
  jobIntervalMs: 10_000,
  maximumJobWaitMs: 300_000,
} as const;

export function collectionScope(collection: string) {
  return { scopeKind: 'collection' as const, collectionKey: collection };
}
export function collectionPath(collection: string) {
  return `${contentPolicy.basePath}/${encodeURIComponent(collection)}`;
}
export function documentPath(collection: string, id: string, locale?: string) {
  const path = `${collectionPath(collection)}/${id}`;
  return locale ? `${path}?locale=${encodeURIComponent(locale)}` : path;
}
