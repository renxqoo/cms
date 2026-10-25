import { z } from 'zod';
import type { EditorNode } from '../../contracts/editor';
import type { JsonValue } from './types';

export interface ParsedField {
  valid: boolean;
  value: JsonValue;
}

export function parseNumber(value: string, node: EditorNode): ParsedField {
  if (value.trim() === '') return { valid: true, value: null };
  const number = Number(value);
  const { precision } = node.constraints;
  const finite =
    Number.isFinite(number) && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim());
  const range =
    (node.constraints.min === undefined || number >= node.constraints.min) &&
    (node.constraints.max === undefined || number <= node.constraints.max);
  const places =
    precision === undefined ||
    Math.abs(number - Number(number.toFixed(precision))) <=
      Number.EPSILON * Math.max(1, Math.abs(number));
  return { valid: finite && range && places, value: finite ? number : null };
}

export function parseJson(value: string): ParsedField {
  if (!value.trim()) return { valid: true, value: null };
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonValue(parsed) ? { valid: true, value: parsed } : { valid: false, value: null };
  } catch {
    return { valid: false, value: null };
  }
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).every(
    ([key, entry]) =>
      !['__proto__', 'constructor', 'prototype'].includes(key) && isJsonValue(entry),
  );
}

export function parseDate(value: string): ParsedField {
  if (value === '') return { valid: true, value: null };
  const date = new Date(`${value}Z`);
  const valid =
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value.slice(0, 16);
  return { valid, value: valid ? date.toISOString() : null };
}

export function dateInput(value: JsonValue | undefined): string {
  if (typeof value !== 'string') return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, -1) : '';
}

export function parseText(text: string, node: EditorNode): ParsedField {
  if (!text) return { valid: true, value: null };
  const { constraints } = node;
  const { length } = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
  );
  const validLength =
    (constraints.minLength === undefined || length >= constraints.minLength) &&
    (constraints.maxLength === undefined || length <= constraints.maxLength);
  return {
    valid: validLength && (node.type !== 'email' || z.email().safeParse(text).success),
    value: text,
  };
}
