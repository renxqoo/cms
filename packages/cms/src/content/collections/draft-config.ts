import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition } from '../definition.ts';

const defaultAutosaveIntervalMs = 2000;
export function draftSettings(collection: CollectionDefinition) {
  if (collection.mode !== 'drafts') return null;
  const configured = collection.drafts;
  const autosave = configured?.autosave;
  return {
    validate: configured?.validate === true,
    autosave: autosave
      ? {
          intervalMs:
            typeof autosave === 'object'
              ? (autosave.intervalMs ?? defaultAutosaveIntervalMs)
              : defaultAutosaveIntervalMs,
        }
      : (false as const),
    schedule: configured?.schedule === true,
  };
}
export function normalizeDrafts(collection: CollectionDefinition): CollectionDefinition {
  if (collection.mode !== 'drafts' && collection.drafts !== undefined) fail('invalid_input');
  const drafts = draftSettings(collection);
  return {
    ...collection,
    ...(drafts ? { drafts } : {}),
    ...(collection.previousSchemas
      ? { previousSchemas: collection.previousSchemas.map(normalizeDrafts) }
      : {}),
  };
}
