import { expect, it } from 'vitest';
import { validateProfileRequest } from '../requests.ts';
import { validateApiBindings } from '../bindings.ts';
import { rm } from 'node:fs/promises';
import { execute, program, protocol } from './multimodal-fixture.ts';
const request = {
  profileKey: 'core.video-tasks',
  flowKey: 'video.seedance-25-text',
  modelId: 'business/seedance-25',
  requestValues: {
    input: { prompt: 'A lake', aspect_ratio: '21:9', resolution: '480p', duration: 5 },
  },
};
it('Seedance 2.5 preserves its main contract and never broadens the old Lite flow', () => {
  const maximum = { ...request.requestValues.input, prompt: '船'.repeat(20480) };
  const result = validateProfileRequest({ ...request, requestValues: { input: maximum } });
  expect(result).toEqual({ kind: 'video', model: 'business/seedance-25', input: maximum });
  expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThan(256 * 1024);
  expect(() =>
    validateProfileRequest({
      ...request,
      requestValues: { input: { ...maximum, prompt: `${maximum.prompt}船` } },
    }),
  ).toThrowError(Error);
  expect(() =>
    validateProfileRequest({
      ...request,
      flowKey: 'video.seedance-text',
      requestValues: { input: maximum },
    }),
  ).toThrowError(Error);
  for (const extra of [
    { camera_fixed: false },
    { image_task_id: '10000000-0000-4000-8000-000000000009' },
    { nsfw_checker: true },
  ])
    expect(() =>
      validateProfileRequest({
        ...request,
        requestValues: { input: { ...request.requestValues.input, ...extra } },
      }),
    ).toThrowError(Error);
});
it('Seedance 2.5 accepts only configured public specification values', () => {
  for (const resolution of ['480p', '720p', '1080p'])
    for (const duration of [5, 10])
      expect(
        validateProfileRequest({
          ...request,
          requestValues: { input: { ...request.requestValues.input, resolution, duration } },
        }),
      ).toMatchObject({ input: { resolution, duration } });
  for (const aspect_ratio of ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'])
    expect(
      validateProfileRequest({
        ...request,
        requestValues: { input: { ...request.requestValues.input, aspect_ratio } },
      }),
    ).toMatchObject({ input: { aspect_ratio } });
  for (const invalid of [
    { duration: 4 },
    { duration: 15 },
    { resolution: '768P' },
    { aspect_ratio: '9:21' },
  ])
    expect(() =>
      validateProfileRequest({
        ...request,
        requestValues: { input: { ...request.requestValues.input, ...invalid } },
      }),
    ).toThrowError(Error);
});
it('profile constraints keep Lite limits and allow only exact 2.5 ranges', () => {
  const binding = {
    key: 'video',
    profileKey: 'core.video-tasks',
    inputModalities: ['text'],
    outputModalities: ['video'],
    capabilities: [],
    enabledFlowKeys: ['video.seedance-25-text'],
    constraints: {
      promptMaxLength: 20480,
      aspectRatios: ['21:9'],
      resolutions: ['1080p'],
      durations: [5, 10],
    },
    scenarios: [
      {
        key: 'lake',
        title: 'Lake',
        flowKey: request.flowKey,
        requestValues: request.requestValues,
      },
    ],
    recipeKeys: ['core.http'],
    defaultScenarioKey: 'lake',
  };
  const input = {
    modelId: request.modelId,
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
  for (const constraints of [
    { promptMaxLength: 20481 },
    { aspectRatios: ['9:21'] },
    { resolutions: ['768P'] },
    { durations: [4] },
  ])
    expect(() =>
      validateApiBindings({ ...input, apiBindings: [{ ...binding, constraints }] }),
    ).toThrowError(Error);
  const lite = {
    ...binding,
    enabledFlowKeys: ['video.seedance-text'],
    constraints: { promptMaxLength: 20480 },
    scenarios: [
      {
        ...binding.scenarios[0],
        flowKey: 'video.seedance-text',
        requestValues: { input: { ...request.requestValues.input, aspect_ratio: '16:9' } },
      },
    ],
  };
  expect(() => validateApiBindings({ ...input, apiBindings: [lite] })).toThrowError(Error);
});

it.each(['javascript', 'typescript', 'python', 'curl', 'go'])(
  '%s 2.5 example sends only its four public fields and returns the settled video URL',
  async (language) => {
    const fixture = await protocol('video');
    const sample = await program({ language, kind: 'video', baseUrl: fixture.baseUrl });
    try {
      const result = await execute({ ...sample, language });
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('https://file.aiquickdraw.com/fixture.mp4');
      expect(fixture.errors).toEqual([]);
      expect(fixture.received.map((item) => item.path)).toEqual([
        'POST /v1/tasks',
        'GET /v1/tasks/10000000-0000-4000-8000-000000000009',
      ]);
      expect(fixture.received[0]?.fields).toEqual({
        kind: 'video',
        model: 'business/video',
        input: {
          prompt: '船'.repeat(20480),
          aspect_ratio: '21:9',
          resolution: '480p',
          duration: 5,
        },
      });
    } finally {
      fixture.server.closeAllConnections();
      await new Promise<void>((resolve) => {
        fixture.server.close(() => resolve());
      });
      await rm(sample.directory, { recursive: true, force: true });
    }
  },
);
