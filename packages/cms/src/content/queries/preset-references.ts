import { fail } from '@new-cms/cms/platform/contracts';
import { collectReferences } from '../fields/collect-references.ts';
import { targetState } from '../documents/relation-scopes.ts';
import { visibleDocuments } from '../documents/visible-documents.ts';
import { presetActions } from './preset-access-contracts.ts';
import type { PresetAccess } from './preset-access-contracts.ts';
import type { ContentState, ContentRuntime } from '../types.ts';
import type { ReferenceValue } from '../definition.ts';

export async function syncPresetReferences(
  state: ContentState,
  runtime: ContentRuntime,
  input: { id: string; access: PresetAccess },
): Promise<void> {
  const { id, access } = input;
  const references: ReferenceValue[] = [];
  for (const action of presetActions) {
    const rule = access[action];
    const registered = state.collection.queryPresetConstraints?.[action]?.find(
      (option) => option.value === rule.constraint,
    );
    if (!registered) continue;
    references.push(
      ...collectReferences({
        collection: { ...state.collection, fields: registered.fields ?? [] },
        data: rule.data ?? {},
        locale: state.locale,
        limits: runtime.limits,
      }).map((reference) => ({ ...reference, path: `${action}.${reference.path}` })),
    );
  }
  if (references.length > runtime.limits.maxExpandNodes) fail('capacity_exceeded');
  const targets = new Map<string, ReferenceValue[]>();
  for (const reference of references) {
    if (reference.media && !runtime.registry.get(reference.collection).upload)
      fail('invalid_input');
    const group = targets.get(reference.collection) ?? [];
    group.push(reference);
    targets.set(reference.collection, group);
  }
  for (const [collection, values] of targets) {
    const target = await targetState(state, { runtime, collection });
    const visible = await visibleDocuments(target, {
      runtime,
      ids: [...new Set(values.map((value) => value.id))],
      trashed: false,
    });
    if (values.some((value) => !visible.has(value.id))) fail('invalid_input');
  }
  await runtime.store.writePresetReferences(state.tx, { id, references });
}
