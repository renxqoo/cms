import { z } from 'zod';
import { validFlowConstraints } from './video-constraints.ts';
import {
  flowKeys,
  modelIdSchema,
  profileFlows,
  profileKeys,
  validateProfileRequest,
} from './requests.ts';

export const modelTasks = [
  'chat',
  'reasoning',
  'coding',
  'image-generation',
  'image-editing',
  'video-generation',
  'speech-recognition',
  'speech-generation',
  'music-generation',
  'embedding',
  'reranking',
] as const;
export const modelFeatures = [
  'streaming',
  'tool-use',
  'structured-output',
  'prompt-caching',
  'local-deployment',
] as const;
export const inputModalities = ['text', 'image', 'audio', 'video'] as const;
export const outputModalities = [...inputModalities, 'vector'] as const;
export const stableKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u)
  .max(80);
const values = <T extends z.ZodType>(schema: T) =>
  z
    .array(schema)
    .max(32)
    .refine((items) => new Set(items).size === items.length);
export const technicalCapabilitiesSchema = z.strictObject({
  inputs: values(z.enum(inputModalities)).min(1),
  outputs: values(z.enum(outputModalities)).min(1),
  tasks: values(z.enum(modelTasks)),
  features: values(z.enum(modelFeatures)),
});
const constraintsSchema = z.strictObject({
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().min(1).max(65536).optional(),
  promptMaxLength: z.number().int().positive().max(20480).optional(),
  aspectRatios: values(z.string().max(16)).optional(),
  resolutions: values(z.enum(['480p', '720p', '1080p', '480P', '768P', '2K'])).optional(),
  durations: values(z.number().int().min(4).max(15)).optional(),
});
const scenarioSchema = z
  .object({
    id: z.uuid().optional(),
    key: stableKeySchema,
    title: z.string().min(1).max(256),
    description: z
      .string()
      .max(2000)
      .nullish()
      .transform((value) => value ?? undefined),
    flowKey: z.enum(flowKeys),
    requestValues: z.unknown(),
  })
  .strict();
const bindingSchema = z.strictObject({
  id: z.uuid().optional(),
  key: stableKeySchema,
  profileKey: z.enum(profileKeys),
  inputModalities: values(z.enum(inputModalities)).min(1),
  outputModalities: values(z.enum(outputModalities)).min(1),
  capabilities: values(z.enum(modelFeatures)),
  enabledFlowKeys: values(z.enum(flowKeys)).min(1),
  constraints: constraintsSchema.nullish().transform((value) => value ?? undefined),
  scenarios: z.array(scenarioSchema).min(1).max(40),
  recipeKeys: z.array(z.literal('core.http')).min(1).max(1),
  defaultScenarioKey: stableKeySchema,
});
export type ApiBinding = z.infer<typeof bindingSchema>;
export type TechnicalCapabilities = z.infer<typeof technicalCapabilitiesSchema>;
const availableInputs = {
  'core.chat': ['text'],
  'core.image-tasks': ['text'],
  'core.video-tasks': ['text', 'image'],
  'core.music-tasks': ['text'],
  'core.transcriptions': ['audio'],
};
const availableOutputs = {
  'core.chat': ['text'],
  'core.image-tasks': ['image'],
  'core.video-tasks': ['video'],
  'core.music-tasks': ['audio'],
  'core.transcriptions': ['text'],
};
export function describeBindingCapabilities(input: {
  profileKey: string;
  flowKeys: readonly string[];
}) {
  const profile = z.enum(profileKeys).parse(input.profileKey);
  if (!input.flowKeys.every((flow) => (profileFlows[profile] as readonly string[]).includes(flow)))
    throw new Error('Flow does not match profile');
  const inputs = [profile === 'core.transcriptions' ? 'audio' : 'text'];
  if (input.flowKeys.includes('video.runway-image')) inputs.push('image');
  return {
    inputModalities: inputs,
    outputModalities: availableOutputs[profile],
    capabilities: input.flowKeys.includes('chat.sse') ? ['streaming'] : [],
  };
}
function subset(actual: readonly string[], allowed: readonly string[]) {
  return actual.every((item) => allowed.includes(item));
}
function assertBinding(
  binding: ApiBinding,
  input: { modelId: string; technicalCapabilities: TechnicalCapabilities },
) {
  const profile = binding.profileKey;
  const technical = input.technicalCapabilities;
  if (
    !subset(binding.inputModalities, availableInputs[profile]) ||
    !subset(binding.outputModalities, availableOutputs[profile]) ||
    !subset(binding.inputModalities, technical.inputs) ||
    !subset(binding.outputModalities, technical.outputs) ||
    !subset(binding.capabilities, technical.features)
  )
    throw new Error('Binding exceeds declared capabilities');
  assertFlowCapabilities(binding, technical);
  if (!subset(binding.enabledFlowKeys, profileFlows[profile]))
    throw new Error('Unsupported binding flow');
  if (
    !binding.enabledFlowKeys.every((flowKey) =>
      validFlowConstraints({
        flowKey,
        resolutions: binding.constraints?.resolutions,
        durations: binding.constraints?.durations,
        aspectRatios: binding.constraints?.aspectRatios,
        promptMaxLength: binding.constraints?.promptMaxLength,
      }),
    )
  )
    throw new Error('Constraints exceed the selected flow');

  const keys = binding.scenarios.map((scenario) => scenario.key);
  if (new Set(keys).size !== keys.length || !keys.includes(binding.defaultScenarioKey))
    throw new Error('Invalid default or duplicate scenario');
  for (const scenario of binding.scenarios) {
    if (!binding.enabledFlowKeys.includes(scenario.flowKey))
      throw new Error('Scenario flow is disabled');
    validateProfileRequest({
      profileKey: profile,
      flowKey: scenario.flowKey,
      modelId: input.modelId,
      requestValues: scenario.requestValues,
    });
  }
}
export function validateApiBindings(input: {
  modelId: string;
  technicalCapabilities: unknown;
  apiBindings: unknown;
  defaultBindingKey: unknown;
}): ApiBinding[] {
  modelIdSchema.parse(input.modelId);
  const technicalCapabilities = technicalCapabilitiesSchema.parse(input.technicalCapabilities);
  const bindings = z.array(bindingSchema).max(20).parse(input.apiBindings);
  const keys = bindings.map((binding) => binding.key);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate binding key');
  if (
    bindings.length === 0
      ? input.defaultBindingKey !== null
      : typeof input.defaultBindingKey !== 'string' || !keys.includes(input.defaultBindingKey)
  )
    throw new Error('Invalid default binding');
  for (const binding of bindings)
    assertBinding(binding, { modelId: input.modelId, technicalCapabilities });
  return bindings;
}

function assertFlowCapabilities(binding: ApiBinding, technical: TechnicalCapabilities) {
  const chat = binding.profileKey === 'core.chat';
  if (!subset(binding.capabilities, chat ? ['streaming'] : []))
    throw new Error('Unsupported execution capability');
  const requiredInput = binding.profileKey === 'core.transcriptions' ? 'audio' : 'text';
  if (!binding.inputModalities.includes(requiredInput))
    throw new Error(
      requiredInput === 'audio' ? 'Audio input is required' : 'Text input is required',
    );
  if (chat && !technical.tasks.some((task) => ['chat', 'reasoning', 'coding'].includes(task)))
    throw new Error('Text task declaration is required');
  const task = {
    'core.chat': null,
    'core.image-tasks': 'image-generation',
    'core.video-tasks': 'video-generation',
    'core.music-tasks': 'music-generation',
    'core.transcriptions': 'speech-recognition',
  } as const;
  const requiredTask = task[binding.profileKey];
  if (requiredTask && !technical.tasks.includes(requiredTask))
    throw new Error('Task declaration is required');
  if (binding.enabledFlowKeys.includes('chat.sse') !== binding.capabilities.includes('streaming'))
    throw new Error('Streaming flow and capability must match');
  if (
    binding.enabledFlowKeys.includes('video.runway-image') !==
    binding.inputModalities.includes('image')
  )
    throw new Error('Reference image flow and modality must match');
}
