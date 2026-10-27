import { expect, it } from 'vitest';
import { describeProfileRequest, validateProfileRequest } from '../requests.ts';
import { describeBindingCapabilities } from '../bindings.ts';

it.each([
  ['core.chat', 'chat.json', 'messages'],
  ['core.chat', 'chat.sse', 'messages'],
  ['core.image-tasks', 'image.generate', 'input'],
  ['core.video-tasks', 'video.seedance-text', 'input'],
  ['core.video-tasks', 'video.seedance-25-text', 'input'],
  ['core.video-tasks', 'video.runway-image', 'input'],
  ['core.music-tasks', 'music.generate', 'input'],
  ['core.transcriptions', 'audio.transcribe', 'language'],
])(
  'request editor for %s / %s can describe its own request without invoking another profile validator',
  (profileKey, flowKey, field) => {
    const schema = describeProfileRequest({ profileKey, flowKey });
    expect(schema).toMatchObject({ type: 'object' });
    expect(schema).toHaveProperty(['properties', field]);
  },
);

it('H3 Max editor only advertises resolutions and duration bounds accepted by that flow', () => {
  const input = { profileKey: 'core.video-tasks', flowKey: 'video.minimax-h3-max' };
  expect(describeProfileRequest(input)).toMatchObject({
    properties: {
      input: {
        properties: {
          resolution: { enum: ['480P', '768P'] },
          duration: { minimum: 5, maximum: 15 },
        },
      },
    },
  });
  expect(() =>
    validateProfileRequest({
      ...input,
      modelId: 'max',
      requestValues: {
        input: { prompt: 'A lake', aspect_ratio: '16:9', resolution: '2K', duration: 5 },
      },
    }),
  ).toThrow(Error);
  expect(() =>
    describeProfileRequest({ profileKey: 'core.chat', flowKey: 'image.generate' }),
  ).toThrow('Flow does not match profile');
});

it('derived integration modalities reflect the selected reference-image and streaming flows', () => {
  expect(
    describeBindingCapabilities({
      profileKey: 'core.video-tasks',
      flowKeys: ['video.runway-image'],
    }),
  ).toEqual({ inputModalities: ['text', 'image'], outputModalities: ['video'], capabilities: [] });
  expect(describeBindingCapabilities({ profileKey: 'core.chat', flowKeys: ['chat.sse'] })).toEqual({
    inputModalities: ['text'],
    outputModalities: ['text'],
    capabilities: ['streaming'],
  });
  expect(
    describeBindingCapabilities({
      profileKey: 'core.transcriptions',
      flowKeys: ['audio.transcribe'],
    }),
  ).toEqual({ inputModalities: ['audio'], outputModalities: ['text'], capabilities: [] });
  expect(() =>
    describeBindingCapabilities({ profileKey: 'core.chat', flowKeys: ['audio.transcribe'] }),
  ).toThrow('Flow does not match profile');
});
