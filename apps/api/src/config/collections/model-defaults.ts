import { describeBindingCapabilities } from '@new-cms/cms/content/delivery';
import type { DocumentData, JsonValue } from '@new-cms/cms/content/generate';

function object(value: JsonValue): value is DocumentData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function modelBindingDefaults(value: JsonValue | undefined): JsonValue | undefined {
  if (!Array.isArray(value)) return value;
  return value.map((row) => {
    if (!object(row)) return row;
    const { profileKey } = row;
    const flowKeys = row['enabledFlowKeys'];
    if (
      typeof profileKey !== 'string' ||
      !Array.isArray(flowKeys) ||
      !flowKeys.every((flow): flow is string => typeof flow === 'string')
    )
      return row;
    try {
      const scenarios = Array.isArray(row['scenarios']) ? row['scenarios'].filter(object) : [];
      const single = scenarios.length === 1 ? scenarios[0]?.['key'] : undefined;
      return {
        ...row,
        ...describeBindingCapabilities({ profileKey, flowKeys }),
        recipeKeys: row['recipeKeys'] ?? ['core.http'],
        ...(row['defaultScenarioKey'] == null && typeof single === 'string'
          ? { defaultScenarioKey: single }
          : {}),
      };
    } catch {
      return row;
    }
  });
}
