import { fieldEditorPolicy } from './policy';
import { z } from 'zod';

export const richTextFormats = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'subscript',
  'superscript',
  'code',
] as const;
export type RichTextFormat = (typeof richTextFormats)[number];
const format = z
  .array(z.enum(richTextFormats))
  .min(1)
  .refine(
    (value) =>
      new Set(value).size === value.length &&
      !(value.includes('subscript') && value.includes('superscript')),
  );
const container = {
  children: z.array(z.unknown()),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  indent: z.number().int().min(0).max(fieldEditorPolicy.richTextMaxIndent).optional(),
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

export function headingTag(level: unknown): 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  if (level === 1) return 'h1';
  if (level === 3) return 'h3';
  if (level === 4) return 'h4';
  if (level === 5) return 'h5';
  if (level === 6) return 'h6';
  return 'h2';
}

export function alignment(value: unknown): '' | 'left' | 'center' | 'right' | 'justify' {
  if (value === 'left' || value === 'center' || value === 'right' || value === 'justify')
    return value;
  return '';
}
