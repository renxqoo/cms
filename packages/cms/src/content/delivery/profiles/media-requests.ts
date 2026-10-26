import { z } from 'zod';
export const h3Flows = [
  'video.minimax-h3',
  'video.minimax-h3-highspeed',
  'video.minimax-h3-lite',
  'video.minimax-h3-max',
] as const;
const text = (maximum: number) =>
  z
    .string()
    .refine(
      (value) =>
        !value.includes('\0') &&
        !/[\ud800-\udfff]/u.test(value) &&
        Array.from(value).length <= maximum,
    );
const music = z.strictObject({
  input: z
    .strictObject({
      prompt: text(2000).optional(),
      lyrics: text(3500).optional(),
      is_instrumental: z.boolean().optional(),
    })
    .refine((value) =>
      value.is_instrumental
        ? (value.prompt?.trim().length ?? 0) > 0
        : (value.lyrics?.trim().length ?? 0) > 0,
    ),
});
const transcription = z.strictObject({
  language: z
    .enum([
      '',
      'zh',
      'yue',
      'en',
      'ja',
      'ko',
      'th',
      'vi',
      'id',
      'ms',
      'fil',
      'ar',
      'tr',
      'fr',
      'de',
      'es',
      'it',
      'pt',
      'pl',
      'ru',
      'uk',
    ])
    .optional(),
});
const seedance25 = z.strictObject({
  input: z.strictObject({
    prompt: text(20480).refine((value) => value.trim().length > 0),
    aspect_ratio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16', '21:9']),
    resolution: z.enum(['480p', '720p', '1080p']),
    duration: z.union([z.literal(5), z.literal(10)]),
  }),
});
export function seedance25Request(values: unknown) {
  return seedance25.parse(values);
}
const h3 = z.strictObject({
  input: z.strictObject({
    prompt: text(10000).refine((value) => value.trim().length > 0),
    aspect_ratio: z.enum(['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']),
    resolution: z.enum(['480P', '768P', '2K']),
    duration: z.number().int().min(4).max(15),
  }),
});
const h3Resolutions = {
  'video.minimax-h3': ['768P', '2K'],
  'video.minimax-h3-highspeed': ['768P'],
  'video.minimax-h3-lite': ['480P', '768P'],
  'video.minimax-h3-max': ['480P', '768P'],
} satisfies Record<(typeof h3Flows)[number], readonly string[]>;
export function musicRequest(values: unknown) {
  return music.parse(values);
}
export function transcriptionRequest(values: unknown) {
  return transcription.parse(values);
}
export function validH3Constraints(input: {
  flowKey: string;
  resolutions?: readonly string[] | undefined;
  durations?: readonly number[] | undefined;
}) {
  const flow = z.enum(h3Flows).safeParse(input.flowKey);
  if (!flow.success) return true;
  const minimum = flow.data === 'video.minimax-h3-max' ? 5 : 4;
  return (
    (input.resolutions ?? []).every((value) => h3Resolutions[flow.data].includes(value)) &&
    (input.durations ?? []).every((value) => value >= minimum && value <= 15)
  );
}
export function h3Request(input: { flowKey: string; requestValues: unknown }) {
  const flow = z.enum(h3Flows).parse(input.flowKey);
  const body = h3.parse(input.requestValues);
  if (
    !h3Resolutions[flow].includes(body.input.resolution) ||
    (flow === 'video.minimax-h3-max' && body.input.duration < 5)
  )
    throw new Error('Unsupported H3 specification');
  return body;
}
