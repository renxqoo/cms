import { z } from 'zod';

const format = z
  .array(
    z.enum(['bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript', 'code']),
  )
  .min(1)
  .refine(
    (value) =>
      new Set(value).size === value.length &&
      !(value.includes('subscript') && value.includes('superscript')),
  );
const container = {
  children: z.array(z.unknown()),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  indent: z.number().int().min(0).max(8).optional(),
};

export const richTextNodeSchemas: Readonly<Record<string, z.ZodType>> = {
  text: z.strictObject({ type: z.literal('text'), text: z.string(), format: format.optional() }),
  horizontalRule: z.strictObject({ type: z.literal('horizontalRule') }),
  paragraph: z.strictObject({ type: z.literal('paragraph'), ...container }),
  quote: z.strictObject({ type: z.literal('quote'), ...container }),
  heading: z.strictObject({
    type: z.literal('heading'),
    ...container,
    level: z.number().int().min(1).max(6).optional(),
  }),
  list: z
    .strictObject({
      type: z.literal('list'),
      ...container,
      kind: z.enum(['bullet', 'number', 'check']).optional(),
      start: z.number().int().min(1).max(2_147_483_647).optional(),
    })
    .refine((value) => value.start === undefined || value.kind === 'number'),
  listItem: z.strictObject({
    type: z.literal('listItem'),
    ...container,
    checked: z.boolean().optional(),
  }),
};
