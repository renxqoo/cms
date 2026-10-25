import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type {
  ContentLimits,
  FieldDefinition,
  JsonValue,
  RichTextNodeRegistration,
} from '../definition.ts';
import { objectValue } from './json-value.ts';
import { validateRichText } from './rich-text.ts';

export function relationValue(value: JsonValue, field: FieldDefinition): JsonValue {
  if (
    !objectValue(value) ||
    Object.keys(value).length !== 2 ||
    typeof value['collection'] !== 'string' ||
    typeof value['id'] !== 'string'
  )
    fail('invalid_input');
  if (
    !(field.relationTo ?? []).includes(value['collection']) ||
    !z.uuid().safeParse(value['id']).success
  )
    fail('invalid_input');
  return { collection: value['collection'], id: value['id'].toLowerCase() };
}
function textValue(value: JsonValue, field: FieldDefinition): string {
  if (typeof value !== 'string') fail('invalid_input');
  const { length } = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
  );
  if (
    (field.minLength !== undefined && length < field.minLength) ||
    (field.maxLength !== undefined && length > field.maxLength)
  )
    fail('invalid_input');
  if (field.type === 'email' && !z.email().safeParse(value).success) fail('invalid_input');
  if (field.type === 'date') {
    if (!z.iso.datetime({ offset: true }).safeParse(value).success) fail('invalid_input');
    return new Date(value).toISOString();
  }
  if (field.type === 'select' && !(field.options ?? []).includes(value)) fail('invalid_input');
  return value;
}
function numberValue(value: JsonValue, field: FieldDefinition): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('invalid_input');
  if (
    (field.min !== undefined && value < field.min) ||
    (field.max !== undefined && value > field.max)
  )
    fail('invalid_input');
  if (
    field.precision !== undefined &&
    Math.abs(value - Number(value.toFixed(field.precision))) >
      Number.EPSILON * Math.max(1, Math.abs(value))
  )
    fail('invalid_input');
  return value;
}
function pointValue(value: JsonValue): JsonValue {
  if (!Array.isArray(value) || value.length !== 2) fail('invalid_input');
  const [longitude, latitude] = value;
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    fail('invalid_input');
  return [longitude, latitude];
}
function jsonValue(value: JsonValue, depth: number, limits: ContentLimits): JsonValue {
  if (depth > limits.maxFieldDepth) fail('payload_too_large');
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, depth + 1, limits));
  if (objectValue(value)) {
    if (Object.keys(value).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
      fail('invalid_input');
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonValue(item, depth + 1, limits)]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) fail('invalid_input');
  if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null)
    fail('invalid_input');
  return value;
}
export function scalarValue(input: {
  value: JsonValue;
  field: FieldDefinition;
  limits: ContentLimits;
  registrations?: readonly RichTextNodeRegistration[];
}): JsonValue {
  const { value, field, limits } = input;
  if (field.hasMany) {
    if (!Array.isArray(value) || value.length > limits.maxArrayItems) fail('invalid_input');
    const values = value.map((item) =>
      scalarValue({ ...input, value: item, field: { ...field, hasMany: false } }),
    );
    if (new Set(values.map((item) => JSON.stringify(item))).size !== values.length)
      fail('invalid_input');
    return values;
  }
  if (field.type === 'richText') return validateRichText(value, limits, input.registrations ?? []);
  const handler = handlers[field.type];
  if (!handler) fail('invalid_input');
  return handler(value, field, limits);
}
const handlers: Partial<
  Record<
    FieldDefinition['type'],
    (value: JsonValue, field: FieldDefinition, limits: ContentLimits) => JsonValue
  >
> = {
  text: textValue,
  textarea: textValue,
  email: textValue,
  date: textValue,
  code: textValue,
  select: textValue,
  number: numberValue,
  boolean(value) {
    if (typeof value !== 'boolean') fail('invalid_input');
    return value;
  },
  point: pointValue,
  json: (value, _field, limits) => jsonValue(value, 1, limits),
  relationship: relationValue,
  upload: relationValue,
};
