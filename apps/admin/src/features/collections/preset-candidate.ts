import type { Collection } from '../../contracts/content';
import type { PresetAccess, QueryPreset } from '../../contracts/query-presets';
export type PresetAction = keyof PresetAccess;
export interface PresetCandidateContext {
  collection: Collection;
  name: string;
  query: QueryPreset['query'];
  locale: string;
  source?: { id: string; version: number };
}
export function presetCandidateBody(context: PresetCandidateContext, access: PresetAccess) {
  return {
    name: context.name,
    query: context.query,
    locale: context.locale,
    access,
    ...context.source,
  };
}
export function presetCandidateKey(
  context: PresetCandidateContext,
  access: PresetAccess,
  actor: string,
) {
  return JSON.stringify([
    actor,
    context.collection.key,
    context.collection.behaviorHash,
    presetCandidateBody(context, access),
  ]);
}
export function customPresetActions(collection: Collection, access: PresetAccess) {
  return (['read', 'update', 'delete'] as const).filter((action) =>
    collection.queryPresetConstraints?.[action].some(
      (option) =>
        !['everyone', 'onlyMe', 'specificUsers'].includes(option.value) &&
        option.value === access[action].constraint,
    ),
  );
}
export interface PresetValidity {
  key: string;
  valid: boolean;
}
