import { fail } from '@new-cms/cms/platform/contracts';
import { collectionMetadata } from '../fields/policy-metadata.ts';
import { allFieldDefinitions } from '../fields/structure.ts';
import { policyScope } from '../hooks/invoke.ts';
import { policyContext } from '../runtime.ts';
import { validateDefinition } from '../collections/validate-definition.ts';
import { normalizeNativeFields } from '../collections/native-fields.ts';
import { presetConstraintChoices } from './preset-choices.ts';
import { presetActions } from './preset-access-contracts.ts';
import type { ContentState } from '../types.ts';
import type { CollectionDefinition, ContentLimits, JsonValue } from '../definition.ts';
import type { PresetAction } from './preset-access-contracts.ts';

export function validatePresetConstraints(
  collection: CollectionDefinition,
  limits: ContentLimits,
): void {
  const { admin: _admin, publicationLocalesField: _locales, ...base } = collection;
  let count = 0;
  for (const action of presetActions) {
    const options = collection.queryPresetConstraints?.[action] ?? [];
    if (
      options.length > limits.maxFields ||
      new Set(options.map((option) => option.value)).size !== options.length
    )
      fail('invalid_input');
    for (const option of options) {
      if (['everyone', 'onlyMe', 'specificUsers'].includes(option.value)) fail('invalid_input');
      const fields = allFieldDefinitions(option.fields ?? []);
      if (
        fields.some(
          (field) =>
            field.type === 'join' ||
            field.virtual !== undefined ||
            field.localized === true ||
            (field.onDelete !== undefined && field.onDelete !== 'restrict'),
        )
      )
        fail('invalid_input');
      count += fields.length;
      if (count > limits.maxFields) fail('capacity_exceeded');
      validateDefinition(
        {
          ...base,
          fields: option.fields ?? [],
          search: [],
          indexes: [],
          defaultSort: [],
          defaultPopulate: [],
        },
        limits,
      );
    }
  }
}

export async function presetConstraintsMetadata(state: ContentState) {
  const result: Record<PresetAction, { value: string; label: string; dataSchema: JsonValue }[]> = {
    read: [],
    update: [],
    delete: [],
  };
  if (state.collection.enableQueryPresets === false) return result;
  for (const action of presetActions)
    for (const option of await presetConstraintChoices(state, action)) {
      const fields =
        state.collection.queryPresetConstraints?.[action]?.find(
          (registered) => registered.value === option.value,
        )?.fields ?? [];
      const { dataSchema } = await collectionMetadata({
        ...policyScope(state),
        context: policyContext(state),
        collection: { ...state.collection, fields },
      });
      result[action].push({ value: option.value, label: option.label, dataSchema });
    }
  return result;
}

export function normalizePresetParameterFields(
  collection: CollectionDefinition,
): CollectionDefinition {
  if (!collection.queryPresetConstraints) return collection;
  return {
    ...collection,
    queryPresetConstraints: Object.fromEntries(
      presetActions.map((action) => [
        action,
        collection.queryPresetConstraints?.[action]?.map((constraint) => ({
          ...constraint,
          fields: normalizeNativeFields({ ...collection, fields: constraint.fields ?? [] }).fields,
        })),
      ]),
    ),
  };
}
