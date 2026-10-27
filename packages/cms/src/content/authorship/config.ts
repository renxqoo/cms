import type { CollectionDefinition } from '../definition.ts';

export function authorshipSettings(collection: CollectionDefinition) {
  if (collection.authorship === false) return { createdBy: false, updatedBy: false };
  const configured = typeof collection.authorship === 'object' ? collection.authorship : {};
  return { createdBy: configured.createdBy ?? true, updatedBy: configured.updatedBy ?? true };
}

export function normalizeAuthorship(collection: CollectionDefinition): CollectionDefinition {
  return {
    ...collection,
    authorship: authorshipSettings(collection),
    ...(collection.previousSchemas
      ? { previousSchemas: collection.previousSchemas.map(normalizeAuthorship) }
      : {}),
  };
}
