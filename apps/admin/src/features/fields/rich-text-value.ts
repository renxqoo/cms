import { z } from 'zod';
import { richTextNodeSchemas } from './rich-text-schema';
export { richTextFormats } from './rich-text-schema';
export type { RichTextFormat } from './rich-text-schema';
import { isFieldData } from './data';
import { isJsonValue } from './parsing';
import type { FieldData, JsonValue } from './types';

export interface RichTextValue {
  version: 1;
  children: FieldData[];
}

export function safeRichTextLink(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !Array.from(value).some((character) => character.charCodeAt(0) <= 32)
  )
    return true;
  try {
    const url = new URL(value);
    return (
      ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) &&
      !Array.from(value).some((character) => character.charCodeAt(0) < 32)
    );
  } catch {
    return false;
  }
}

function validReference(value: FieldData) {
  return typeof value['collection'] === 'string' && z.uuid().safeParse(value['id']).success;
}

function validCustomNode(value: FieldData, version: string) {
  return (
    value['version'] === version &&
    Object.hasOwn(value, 'payload') &&
    Object.keys(value).every((key) => ['type', 'version', 'payload'].includes(key))
  );
}

function validContainer(value: FieldData, type: string): boolean {
  if (type === 'link')
    return (
      Object.keys(value).every((key) => ['type', 'url', 'reference', 'children'].includes(key)) &&
      (value['reference'] === undefined
        ? safeRichTextLink(value['url'])
        : value['url'] === undefined &&
          isFieldData(value['reference']) &&
          Object.keys(value['reference']).length === 2 &&
          validReference(value['reference']))
    );
  return (
    Object.hasOwn(richTextNodeSchemas, type) &&
    richTextNodeSchemas[type]?.safeParse(value).success === true
  );
}

function validNode(
  value: JsonValue,
  registrations: readonly { type: string; version: string }[],
): value is FieldData {
  if (!isFieldData(value) || typeof value['type'] !== 'string') return false;
  const { type } = value;
  const keys = Object.keys(value);
  if (type === 'text' || type === 'horizontalRule')
    return richTextNodeSchemas[type]?.safeParse(value).success === true;
  if (type === 'relationship' || type === 'media')
    return (
      keys.length === 3 &&
      keys.every((key) => ['type', 'collection', 'id'].includes(key)) &&
      validReference(value)
    );
  const registered = registrations.find((registration) => registration.type === type);
  if (registered) return validCustomNode(value, registered.version);
  if (!validContainer(value, type)) return false;
  return (
    Array.isArray(value['children']) &&
    value['children'].every((child) => validNode(child, registrations))
  );
}

export function parseRichText(
  value: unknown,
  registrations: readonly { type: string; version: string }[] = [],
): RichTextValue | null {
  if (
    !isJsonValue(value) ||
    !isFieldData(value) ||
    value['version'] !== 1 ||
    Object.keys(value).some((key) => !['version', 'children'].includes(key))
  )
    return null;
  const { children } = value;
  return Array.isArray(children) && children.every((child) => validNode(child, registrations))
    ? { version: 1, children }
    : null;
}

export function richTextData(value: RichTextValue): FieldData {
  return { version: value.version, children: value.children };
}

export function richTextNode(type: string): FieldData {
  if (type === 'horizontalRule') return { type };
  if (type === 'text') return { type, text: '' };
  if (type === 'link') return { type, url: 'https://', children: [{ type: 'text', text: '' }] };
  if (type === 'list')
    return { type, children: [{ type: 'listItem', children: [{ type: 'text', text: '' }] }] };
  return { type, children: [] };
}
