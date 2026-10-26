import { expect, it } from 'vitest';
import { validateApiBindings } from '../bindings.ts';
const technical = { inputs: ['text'], outputs: ['text'], tasks: ['chat'], features: ['streaming'] };
const binding = {
  key: 'chat',
  profileKey: 'core.chat',
  inputModalities: ['text'],
  outputModalities: ['text'],
  capabilities: ['streaming'],
  enabledFlowKeys: ['chat.json', 'chat.sse'],
  constraints: {},
  recipeKeys: ['core.http'],
  defaultScenarioKey: 'hello',
  scenarios: [
    {
      key: 'hello',
      title: 'Greeting',
      flowKey: 'chat.json',
      requestValues: { messages: [{ role: 'user', content: 'Hi' }], max_tokens: 100 },
    },
  ],
};
const input = {
  modelId: 'Provider/Model',
  technicalCapabilities: technical,
  apiBindings: [binding],
  defaultBindingKey: 'chat',
};
it('keeps vector and audio technical declarations complete without executable bindings', () => {
  for (const output of ['vector', 'audio'])
    expect(
      validateApiBindings({
        modelId: 'sample',
        technicalCapabilities: {
          inputs: ['text'],
          outputs: [output],
          tasks: output === 'vector' ? ['embedding'] : ['speech-generation'],
          features: [],
        },
        apiBindings: [],
        defaultBindingKey: null,
      }),
    ).toEqual([]);
});
it('validates callable scenarios independently from display model capabilities', () => {
  expect(validateApiBindings(input)).toHaveLength(1);
  expect(() =>
    validateApiBindings({ ...input, apiBindings: [{ ...binding, capabilities: ['tool-use'] }] }),
  ).toThrowError(Error);
  expect(() =>
    validateApiBindings({ ...input, technicalCapabilities: { ...technical, outputs: ['vector'] } }),
  ).toThrowError(Error);
});
it('rejects nonexistent defaults and duplicate binding or scenario identities', () => {
  expect(() => validateApiBindings({ ...input, defaultBindingKey: 'missing' })).toThrowError(Error);
  expect(() => validateApiBindings({ ...input, apiBindings: [binding, binding] })).toThrowError(
    Error,
  );
  expect(() =>
    validateApiBindings({
      ...input,
      apiBindings: [{ ...binding, scenarios: [...binding.scenarios, ...binding.scenarios] }],
    }),
  ).toThrowError(Error);
});
it('does not allow disabled scenario flows or credentials in body examples', () => {
  expect(() =>
    validateApiBindings({ ...input, apiBindings: [{ ...binding, enabledFlowKeys: ['chat.sse'] }] }),
  ).toThrowError(Error);
  expect(() =>
    validateApiBindings({
      ...input,
      apiBindings: [
        { ...binding, scenarios: [{ ...binding.scenarios[0], requestValues: { model: 'other' } }] },
      ],
    }),
  ).toThrowError(Error);
});
it('requires truthful flow capabilities and matching technical tasks', () => {
  for (const changed of [
    { ...binding, capabilities: [] },
    { ...binding, enabledFlowKeys: ['chat.json'] },
    { ...binding, enabledFlowKeys: ['image.generate'] },
    { ...binding, defaultScenarioKey: 'missing' },
  ])
    expect(() => validateApiBindings({ ...input, apiBindings: [changed] })).toThrowError(Error);
  expect(() =>
    validateApiBindings({
      ...input,
      technicalCapabilities: { ...technical, tasks: ['embedding'] },
    }),
  ).toThrowError('Text task declaration is required');
});
it.each(['image', 'video'])(
  'requires the %s generation task declaration and a supported technical intersection',
  (kind) => {
    const taskBinding = {
      ...binding,
      key: 'task',
      profileKey: `core.${kind}-tasks`,
      outputModalities: [kind],
      capabilities: [],
      enabledFlowKeys: [kind === 'image' ? 'image.generate' : 'video.seedance-text'],
      defaultScenarioKey: 'scene',
      scenarios: [
        {
          key: 'scene',
          title: 'Scene',
          flowKey: kind === 'image' ? 'image.generate' : 'video.seedance-text',
          requestValues: {
            input:
              kind === 'image'
                ? { prompt: 'A scene', aspect_ratio: '1:1' }
                : { prompt: 'A scene', aspect_ratio: '16:9', resolution: '720p', duration: 5 },
          },
        },
      ],
    };
    const current = {
      ...input,
      defaultBindingKey: 'task',
      apiBindings: [taskBinding],
      technicalCapabilities: {
        inputs: ['text'],
        outputs: [kind],
        tasks: [`${kind}-generation`],
        features: [],
      },
    };
    expect(validateApiBindings(current)).toHaveLength(1);
    expect(() =>
      validateApiBindings({
        ...current,
        technicalCapabilities: { ...current.technicalCapabilities, tasks: [] },
      }),
    ).toThrowError(Error);
  },
);
it('only enables reference images together with the real reference flow and declared image input', () => {
  const taskBinding = {
    ...binding,
    key: 'task',
    profileKey: 'core.video-tasks',
    inputModalities: ['text', 'image'],
    outputModalities: ['video'],
    capabilities: [],
    enabledFlowKeys: ['video.runway-image'],
    defaultScenarioKey: 'scene',
    scenarios: [
      {
        key: 'scene',
        title: 'Scene',
        flowKey: 'video.runway-image',
        requestValues: {
          input: {
            prompt: 'A scene',
            image_task_id: '10000000-0000-4000-8000-000000000001',
            resolution: '720p',
            duration: 5,
          },
        },
      },
    ],
  };
  const current = {
    ...input,
    defaultBindingKey: 'task',
    apiBindings: [taskBinding],
    technicalCapabilities: {
      inputs: ['text', 'image'],
      outputs: ['video'],
      tasks: ['video-generation'],
      features: [],
    },
  };
  expect(validateApiBindings(current)).toHaveLength(1);
  expect(() =>
    validateApiBindings({
      ...current,
      apiBindings: [{ ...taskBinding, inputModalities: ['image'] }],
    }),
  ).toThrowError('Text input is required');
  expect(() =>
    validateApiBindings({
      ...current,
      apiBindings: [{ ...taskBinding, inputModalities: ['text'] }],
    }),
  ).toThrowError('Reference image flow and modality must match');
  expect(() => validateApiBindings({ ...input, defaultBindingKey: null })).toThrowError(
    'Invalid default binding',
  );
  expect(() =>
    validateApiBindings({
      ...input,
      apiBindings: [{ ...binding, capabilities: ['tool-use'] }],
      technicalCapabilities: { ...technical, features: ['tool-use'] },
    }),
  ).toThrowError('Unsupported execution capability');
});
