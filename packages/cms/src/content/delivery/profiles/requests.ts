import { z } from 'zod';
import {
  h3Flows,
  h3Request,
  musicRequest,
  transcriptionRequest,
  seedance25Request,
  mediaRequestSchema,
} from './media-requests.ts';

export const profileKeys = [
  'core.chat',
  'core.image-tasks',
  'core.video-tasks',
  'core.music-tasks',
  'core.transcriptions',
] as const;
export const flowKeys = [
  'chat.json',
  'chat.sse',
  'image.generate',
  'video.seedance-text',
  'video.seedance-25-text',
  'video.runway-text',
  'video.runway-image',
  ...h3Flows,
  'music.generate',
  'audio.transcribe',
] as const;
export type ProfileKey = (typeof profileKeys)[number];
export type FlowKey = (typeof flowKeys)[number];
export interface ProfileRequest {
  profileKey: string;
  flowKey: string;
  modelId: string;
  requestValues: unknown;
}
export const modelIdSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      Buffer.byteLength(value, 'utf8') <= 200 &&
      value.trim() === value &&
      !Array.from(value).some((character) => {
        const point = character.codePointAt(0) ?? 0;
        return point < 32 || (point >= 127 && point <= 159);
      }),
  );
const prompt = (maximum: number) =>
  z
    .string()
    .refine(
      (value) =>
        value.trim().length > 0 &&
        !value.includes('\0') &&
        Array.from(value).length <= maximum &&
        !/[\ud800-\udfff]/u.test(value),
    );
const ratio = z.enum(['1:1', '4:3', '3:4', '16:9', '9:16']);
const chat = z.strictObject({
  messages: z
    .array(
      z.strictObject({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().refine((value) => !value.includes('\0')),
      }),
    )
    .min(1)
    .max(128),
  max_tokens: z.number().int().min(1).max(65536),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
});
const image = z.strictObject({ prompt: prompt(1000), aspect_ratio: ratio });
const seedance = z.strictObject({
  prompt: prompt(10000),
  aspect_ratio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '9:21']),
  resolution: z.enum(['480p', '720p', '1080p']),
  duration: z.union([z.literal(5), z.literal(10)]),
  camera_fixed: z.boolean().optional(),
});
const runwayBase = {
  prompt: prompt(1800),
  resolution: z.enum(['720p', '1080p']),
  duration: z.union([z.literal(5), z.literal(10)]),
};
const runwayText = z.strictObject({ ...runwayBase, aspect_ratio: ratio });
const runwayImage = z.strictObject({ ...runwayBase, image_task_id: z.uuid() });
const task = <T extends z.ZodType>(input: T) => z.strictObject({ input });
export function describeProfileRequest(input: { profileKey: string; flowKey: string }) {
  const profile = z.enum(profileKeys).parse(input.profileKey);
  const flow = z.enum(flowKeys).parse(input.flowKey);
  if (!profileFlows[profile].includes(flow)) throw new Error('Flow does not match profile');
  let schema: z.ZodType;
  if (profile === 'core.chat') schema = chat;
  else if (profile === 'core.image-tasks') schema = task(image);
  else if (flow === 'video.seedance-text') schema = task(seedance);
  else if (flow === 'video.runway-text') schema = task(runwayText);
  else if (flow === 'video.runway-image') schema = task(runwayImage);
  else schema = mediaRequestSchema(flow);
  return z.json().parse(z.toJSONSchema(schema));
}
export const profileFlows: Readonly<Record<ProfileKey, readonly FlowKey[]>> = {
  'core.chat': ['chat.json', 'chat.sse'],
  'core.image-tasks': ['image.generate'],
  'core.video-tasks': [
    'video.seedance-text',
    'video.seedance-25-text',
    'video.runway-text',
    'video.runway-image',
    ...h3Flows,
  ],
  'core.music-tasks': ['music.generate'],
  'core.transcriptions': ['audio.transcribe'],
};
function chatRequest(input: ProfileRequest) {
  const body = chat.parse(input.requestValues);
  const stream = input.flowKey === 'chat.sse';
  if (body.stream !== undefined && body.stream !== stream)
    throw new Error('Stream does not match flow');
  return { ...body, model: input.modelId, stream };
}
function videoRequest(input: ProfileRequest) {
  if (input.flowKey === 'video.seedance-25-text') return seedance25Request(input.requestValues);
  if ((h3Flows as readonly string[]).includes(input.flowKey)) return h3Request(input);
  if (input.flowKey === 'video.seedance-text') return task(seedance).parse(input.requestValues);
  const body =
    input.flowKey === 'video.runway-image'
      ? task(runwayImage).parse(input.requestValues)
      : task(runwayText).parse(input.requestValues);
  if (body.input.resolution === '1080p' && body.input.duration !== 5)
    throw new Error('Unsupported Runway duration');
  return body;
}
export function validateProfileRequest(input: ProfileRequest): Record<string, unknown> {
  const profile = z.enum(profileKeys).parse(input.profileKey);
  const flow = z.enum(flowKeys).parse(input.flowKey);
  modelIdSchema.parse(input.modelId);
  if (!profileFlows[profile].includes(flow)) throw new Error('Flow does not match profile');
  let body: Record<string, unknown>;
  if (profile === 'core.chat') body = chatRequest(input);
  else if (profile === 'core.image-tasks')
    body = { kind: 'image', model: input.modelId, ...task(image).parse(input.requestValues) };
  else if (profile === 'core.music-tasks')
    body = { kind: 'music', model: input.modelId, ...musicRequest(input.requestValues) };
  else if (profile === 'core.transcriptions')
    body = { model: input.modelId, ...transcriptionRequest(input.requestValues) };
  else body = { kind: 'video', model: input.modelId, ...videoRequest(input) };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 256 * 1024)
    throw new Error('Request exceeds Core byte limit');
  return body;
}
