import { expect, it } from 'vitest';
import { validateProfileRequest } from '../requests.ts';

const chat = {
  profileKey: 'core.chat',
  flowKey: 'chat.json',
  modelId: 'MiniMax/M3.1',
  requestValues: { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 100 },
};
it('preserves the exact business model and injects it into a closed Chat body', () => {
  expect(validateProfileRequest(chat)).toEqual({
    model: 'MiniMax/M3.1',
    messages: [{ role: 'user', content: 'Hello' }],
    max_tokens: 100,
    stream: false,
  });
});
it.each(['model', 'authorization', 'baseUrl', 'tools', 'reasoning_effort'])(
  'rejects untrusted %s before rendering any executable sample',
  (field) => {
    expect(() =>
      validateProfileRequest({
        ...chat,
        requestValues: { ...chat.requestValues, [field]: 'untrusted' },
      }),
    ).toThrowError(Error);
  },
);
it('requires stream matching the selected Chat flow and disallows multimodal content', () => {
  expect(() =>
    validateProfileRequest({ ...chat, requestValues: { ...chat.requestValues, stream: true } }),
  ).toThrowError(Error);
  expect(() =>
    validateProfileRequest({
      ...chat,
      requestValues: { messages: [{ role: 'user', content: [] }], max_tokens: 100 },
    }),
  ).toThrowError(Error);
  expect(validateProfileRequest({ ...chat, flowKey: 'chat.sse' })).toMatchObject({ stream: true });
});
it('rejects malformed business identities without trimming or rewriting valid symbols', () => {
  for (const modelId of [' x', 'x ', 'x\n', 'x\u007f', '😀'.repeat(51)])
    expect(() => validateProfileRequest({ ...chat, modelId })).toThrowError(Error);
});
it('validates image Unicode limits and excludes unsupported image fields', () => {
  const input = {
    profileKey: 'core.image-tasks',
    flowKey: 'image.generate',
    modelId: 'image/model',
    requestValues: { input: { prompt: '😀'.repeat(1000), aspect_ratio: '1:1' } },
  };
  expect(validateProfileRequest(input)).toMatchObject({ kind: 'image', model: 'image/model' });
  expect(() =>
    validateProfileRequest({
      ...input,
      requestValues: { input: { prompt: '😀'.repeat(1001), aspect_ratio: '1:1' } },
    }),
  ).toThrowError(Error);
  expect(() =>
    validateProfileRequest({
      ...input,
      requestValues: { input: { prompt: 'x', aspect_ratio: '1:1', seed: 1 } },
    }),
  ).toThrowError(Error);
});
it('enforces distinct Seedance, Runway text and reference image input contracts', () => {
  const input = {
    profileKey: 'core.video-tasks',
    modelId: 'video/model',
    flowKey: 'video.runway-text',
    requestValues: {
      input: { prompt: 'A scene', resolution: '1080p', duration: 5, aspect_ratio: '16:9' },
    },
  };
  expect(validateProfileRequest(input)).toMatchObject({ kind: 'video' });
  expect(() =>
    validateProfileRequest({
      ...input,
      requestValues: { input: { ...input.requestValues.input, duration: 10 } },
    }),
  ).toThrowError(Error);
  expect(() =>
    validateProfileRequest({
      ...input,
      requestValues: { input: { ...input.requestValues.input, camera_fixed: false } },
    }),
  ).toThrowError(Error);
  expect(
    validateProfileRequest({
      ...input,
      flowKey: 'video.seedance-text',
      requestValues: { input: { ...input.requestValues.input, camera_fixed: true, duration: 10 } },
    }),
  ).toMatchObject({ kind: 'video' });
  expect(
    validateProfileRequest({
      ...input,
      flowKey: 'video.runway-image',
      requestValues: {
        input: {
          prompt: 'A scene',
          resolution: '720p',
          duration: 5,
          image_task_id: '10000000-0000-4000-8000-000000000001',
        },
      },
    }),
  ).toMatchObject({ kind: 'video' });
  expect(() => validateProfileRequest({ ...input, flowKey: 'video.runway-image' })).toThrowError(
    Error,
  );
});
it('does not register unsupported profiles or mismatched flows', () => {
  expect(() => validateProfileRequest({ ...chat, profileKey: 'core.embeddings' })).toThrowError(
    Error,
  );
  expect(() => validateProfileRequest({ ...chat, flowKey: 'image.generate' })).toThrowError(Error);
});
it('enforces the Core body byte budget independently of message count', () => {
  expect(() =>
    validateProfileRequest({
      ...chat,
      requestValues: {
        messages: Array.from({ length: 128 }, () => ({ role: 'user', content: 'x'.repeat(3000) })),
        max_tokens: 1,
      },
    }),
  ).toThrowError('Request exceeds Core byte limit');
});
