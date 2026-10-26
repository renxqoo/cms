import { z } from 'zod';
import { flowKeys, profileFlows, profileKeys, validateProfileRequest } from './requests.ts';
const draftScenario = z
  .object({
    key: z.string().optional(),
    flowKey: z.enum(flowKeys).optional(),
    requestValues: z.unknown().optional(),
  })
  .passthrough();
const draftBinding = z
  .object({
    key: z.string().optional(),
    profileKey: z.enum(profileKeys).optional(),
    enabledFlowKeys: z.array(z.enum(flowKeys)).optional(),
    scenarios: z.array(draftScenario).optional(),
  })
  .passthrough();
export function validateDraftApiBindings(input: {
  modelId: string;
  apiBindings: unknown;
  defaultBindingKey: unknown;
}): boolean {
  const result = z.array(draftBinding).max(20).safeParse(input.apiBindings);
  if (!result.success) return false;
  const keys = result.data.flatMap((binding) => (binding.key === undefined ? [] : [binding.key]));
  if (
    new Set(keys).size !== keys.length ||
    (typeof input.defaultBindingKey === 'string' && !keys.includes(input.defaultBindingKey))
  )
    return false;
  return result.data.every((binding) => validDraftBinding(binding, input.modelId));
}
function validDraftBinding(binding: z.infer<typeof draftBinding>, modelId: string): boolean {
  const scenarioKeys = (binding.scenarios ?? []).flatMap((scenario) =>
    scenario.key === undefined ? [] : [scenario.key],
  );
  if (new Set(scenarioKeys).size !== scenarioKeys.length) return false;
  const profile = binding.profileKey;
  if (!profile) return true;
  if (binding.enabledFlowKeys?.some((flow) => !profileFlows[profile].includes(flow))) return false;
  try {
    for (const scenario of binding.scenarios ?? []) {
      if (!scenario.flowKey || scenario.requestValues === undefined) continue;
      if (binding.enabledFlowKeys && !binding.enabledFlowKeys.includes(scenario.flowKey))
        return false;
      validateProfileRequest({
        profileKey: profile,
        flowKey: scenario.flowKey,
        modelId,
        requestValues: scenario.requestValues,
      });
    }
    return true;
  } catch {
    return false;
  }
}
