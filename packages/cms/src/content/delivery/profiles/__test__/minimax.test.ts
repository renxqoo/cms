import { expect, it } from 'vitest';
import { validateProfileRequest } from '../requests.ts';
import { validateApiBindings } from '../bindings.ts';
import { renderIntegrationExamples } from '../examples.ts';
const music = {
  profileKey: 'core.music-tasks',
  flowKey: 'music.generate',
  modelId: 'business/music',
  requestValues: { input: { prompt: 'A quiet melody', is_instrumental: true } },
};
const transcription = {
  profileKey: 'core.transcriptions',
  flowKey: 'audio.transcribe',
  modelId: 'business/asr',
  requestValues: { language: 'en' },
};
const policy = {
  requestTimeoutMs: 2000,
  pollIntervalMs: 1000,
  pollDeadlineMs: 3000,
  maxResponseBytes: 1048576,
};
it('validates musical intent and injects the exact business model without supplier fields', () => {
  expect(validateProfileRequest(music)).toEqual({
    kind: 'music',
    model: 'business/music',
    input: { prompt: 'A quiet melody', is_instrumental: true },
  });
  expect(
    validateProfileRequest({
      ...music,
      requestValues: { input: { lyrics: '[Verse]\nOriginal words' } },
    }),
  ).toEqual({
    kind: 'music',
    model: 'business/music',
    input: { lyrics: '[Verse]\nOriginal words' },
  });
  for (const requestValues of [
    { input: {} },
    { input: { prompt: 'No lyrics' } },
    { input: { is_instrumental: true, prompt: ' ' } },
    { input: { lyrics: 'x'.repeat(3501) } },
    { input: { lyrics: 'x', prompt: 'y'.repeat(2001) } },
    { input: { lyrics: 'x', stream: true } },
  ])
    expect(() => validateProfileRequest({ ...music, requestValues })).toThrowError(Error);
});
it('transcription uses only form text fields and never accepts arbitrary audio URLs or paths', () => {
  expect(validateProfileRequest(transcription)).toEqual({ model: 'business/asr', language: 'en' });
  expect(validateProfileRequest({ ...transcription, requestValues: {} })).toEqual({
    model: 'business/asr',
  });
  for (const requestValues of [
    { language: 'invented' },
    { file: 'file:///private/audio.wav' },
    { audio_url: 'https://private/audio.wav' },
    { duration_ms: 1 },
    { model: 'supplier-name' },
  ])
    expect(() => validateProfileRequest({ ...transcription, requestValues })).toThrowError(Error);
});
const h3Specifications = [
  { flowKey: 'video.minimax-h3', resolutions: ['768P', '2K'], minimum: 4 },
  { flowKey: 'video.minimax-h3-highspeed', resolutions: ['768P'], minimum: 4 },
  { flowKey: 'video.minimax-h3-lite', resolutions: ['480P', '768P'], minimum: 4 },
  { flowKey: 'video.minimax-h3-max', resolutions: ['480P', '768P'], minimum: 5 },
];
it.each(h3Specifications)(
  '$flowKey validates the exact public H3 specification',
  (specification) => {
    const request = {
      profileKey: 'core.video-tasks',
      flowKey: specification.flowKey,
      modelId: 'business/H3',
    };
    for (const resolution of specification.resolutions) {
      const requestValues = {
        input: {
          prompt: 'A lake',
          aspect_ratio: '21:9',
          resolution,
          duration: specification.minimum,
        },
      };
      expect(validateProfileRequest({ ...request, requestValues })).toEqual({
        kind: 'video',
        model: 'business/H3',
        ...requestValues,
      });
    }
    for (const resolution of ['480P', '768P', '2K', '1080p'].filter(
      (value) => !specification.resolutions.includes(value),
    ))
      expect(() =>
        validateProfileRequest({
          ...request,
          requestValues: {
            input: {
              prompt: 'A lake',
              aspect_ratio: '16:9',
              resolution,
              duration: specification.minimum,
            },
          },
        }),
      ).toThrowError(Error);
    for (const duration of [specification.minimum - 1, 16])
      expect(() =>
        validateProfileRequest({
          ...request,
          requestValues: {
            input: {
              prompt: 'A lake',
              aspect_ratio: '16:9',
              resolution: specification.resolutions[0],
              duration,
            },
          },
        }),
      ).toThrowError(Error);
  },
);
it.each([
  {
    profileKey: 'core.music-tasks',
    flowKey: 'music.generate',
    inputs: ['text'],
    outputs: ['audio'],
    task: 'music-generation',
    requestValues: music.requestValues,
  },
  {
    profileKey: 'core.transcriptions',
    flowKey: 'audio.transcribe',
    inputs: ['audio'],
    outputs: ['text'],
    task: 'speech-recognition',
    requestValues: transcription.requestValues,
  },
])('$profileKey requires its true technical modality and task', (value) => {
  const { profileKey, flowKey, inputs, outputs, task, requestValues } = value;
  const binding = {
    key: 'call',
    profileKey,
    inputModalities: inputs,
    outputModalities: outputs,
    capabilities: [],
    enabledFlowKeys: [flowKey],
    scenarios: [{ key: 'sample', title: 'Example', flowKey, requestValues }],
    recipeKeys: ['core.http'],
    defaultScenarioKey: 'sample',
  };
  const input = {
    modelId: 'business/model',
    technicalCapabilities: { inputs, outputs, tasks: [task], features: [] },
    apiBindings: [binding],
    defaultBindingKey: 'call',
  };
  expect(validateApiBindings(input)).toHaveLength(1);
  expect(() =>
    validateApiBindings({
      ...input,
      technicalCapabilities: { inputs, outputs, tasks: [], features: [] },
    }),
  ).toThrowError(Error);
  expect(() =>
    validateApiBindings({ ...input, apiBindings: [{ ...binding, inputModalities: ['video'] }] }),
  ).toThrowError(Error);
});
it.each([music, transcription])(
  'renders seven public language programs for $profileKey',
  (input) => {
    const result = renderIntegrationExamples({
      ...input,
      baseUrl: 'https://api.oneaster.test/v1',
      policy,
    });
    expect(result.map((item) => item.key)).toEqual([
      'curl',
      'python',
      'javascript',
      'typescript',
      'go',
      'java',
      'php',
    ]);
    for (const item of result) {
      expect(item.code).not.toMatch(/@@[A-Z_]+@@/u);
      expect(item.code).not.toContain('/core/');
      expect(item.code).not.toContain('/lookup');
      expect(item.code).toContain('ONEASTER_INTENT_ID');
    }
  },
);
it('every transcription renderer names the real public multipart endpoint and required local file', () => {
  for (const item of renderIntegrationExamples({
    ...transcription,
    baseUrl: 'https://api.oneaster.test/v1',
    policy,
  })) {
    expect(item.code).toContain('/audio/transcriptions');
    expect(item.code).toContain('ONEASTER_AUDIO_FILE');
  }
});
it('H3 binding constraints cannot advertise resolutions or durations outside its chosen flow', () => {
  const binding = {
    key: 'video',
    profileKey: 'core.video-tasks',
    inputModalities: ['text'],
    outputModalities: ['video'],
    capabilities: [],
    enabledFlowKeys: ['video.minimax-h3-highspeed'],
    constraints: { resolutions: ['768P'], durations: [4, 15] },
    scenarios: [
      {
        key: 'scene',
        title: 'Scene',
        flowKey: 'video.minimax-h3-highspeed',
        requestValues: {
          input: { prompt: 'Lake', aspect_ratio: '16:9', resolution: '768P', duration: 4 },
        },
      },
    ],
    recipeKeys: ['core.http'],
    defaultScenarioKey: 'scene',
  };
  const input = {
    modelId: 'business/video',
    technicalCapabilities: {
      inputs: ['text'],
      outputs: ['video'],
      tasks: ['video-generation'],
      features: [],
    },
    apiBindings: [binding],
    defaultBindingKey: 'video',
  };
  expect(validateApiBindings(input)).toHaveLength(1);
  expect(() =>
    validateApiBindings({
      ...input,
      apiBindings: [{ ...binding, constraints: { resolutions: ['2K'] } }],
    }),
  ).toThrowError(Error);
  expect(() =>
    validateApiBindings({
      ...input,
      apiBindings: [
        {
          ...binding,
          enabledFlowKeys: ['video.minimax-h3-max'],
          constraints: { durations: [4] },
          scenarios: [
            {
              ...binding.scenarios[0],
              flowKey: 'video.minimax-h3-max',
              requestValues: {
                input: { prompt: 'Lake', aspect_ratio: '16:9', resolution: '768P', duration: 5 },
              },
            },
          ],
        },
      ],
    }),
  ).toThrowError(Error);
});
