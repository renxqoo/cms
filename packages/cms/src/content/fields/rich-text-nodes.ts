import { fail } from '@new-cms/cms/platform/contracts';
import type {
  ContentLimits,
  DocumentData,
  JsonValue,
  ReferenceValue,
  RichTextNodeRegistration,
} from '../definition.ts';
import { assertJsonBudget } from './data-budget.ts';
import { objectValue } from './json-value.ts';
import { ruleResult } from './rule-result.ts';

const builtins = new Set([
  'text',
  'relationship',
  'media',
  'paragraph',
  'heading',
  'list',
  'listItem',
  'link',
]);
const unsafeSegments = new Set(['__proto__', 'constructor', 'prototype']);
const identity = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const collectionKey = /^[a-z][a-z0-9_-]{0,63}$/;

function exactKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail('invalid_input');
}
function version(value: unknown): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    value.trim() !== value
  )
    fail('invalid_input');
}
function callback(value: unknown): void {
  if (!objectValue(value)) fail('invalid_input');
  exactKeys(value, ['version', 'run']);
  version(value['version']);
  const { run } = value;
  if (typeof run !== 'function' || Object.prototype.toString.call(run) !== '[object Function]')
    fail('invalid_input');
}
export function validateNodeRegistrations(
  registrations: readonly RichTextNodeRegistration[],
): void {
  const seen = new Set<string>();
  for (const registration of registrations) {
    if (!objectValue(registration)) fail('invalid_input');
    exactKeys(registration, ['type', 'version', 'validate', 'references']);
    const { type } = registration;
    if (
      typeof type !== 'string' ||
      !/^[a-z][a-zA-Z0-9_-]{0,63}$/.test(type) ||
      builtins.has(type) ||
      seen.has(type)
    )
      fail('invalid_input');
    seen.add(type);
    version(registration.version);
    callback(registration.validate);
    if (registration.references !== undefined) callback(registration.references);
  }
}
function synchronous(work: () => unknown): unknown {
  let value: unknown;
  try {
    value = work();
  } catch {
    fail('invalid_input');
  }
  if (value instanceof Promise) {
    void value.catch(() => null);
    fail('invalid_input');
  }
  return value;
}
function immutable(value: JsonValue): JsonValue {
  const result = structuredClone(value);
  const pending = [result];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object') continue;
    Object.freeze(current);
    pending.push(...Object.values(current));
  }
  return result;
}
interface NodeInput {
  node: DocumentData;
  registrations: readonly RichTextNodeRegistration[];
  limits: ContentLimits;
}
function preparedNode(
  input: NodeInput,
): { registration: RichTextNodeRegistration; payload: JsonValue } | undefined {
  validateNodeRegistrations(input.registrations);
  const registration = input.registrations.find((item) => item.type === input.node['type']);
  if (!registration) return undefined;
  exactKeys(input.node, ['type', 'version', 'payload']);
  if (input.node['version'] !== registration.version || !Object.hasOwn(input.node, 'payload'))
    fail('invalid_input');
  const { payload } = input.node;
  assertJsonBudget(payload, {
    maxDepth: input.limits.maxRichTextDepth,
    maxBytes: input.limits.maxDataBytes,
    maxNodes: input.limits.maxRichTextNodes,
    maxArrayLength: input.limits.maxArrayItems,
  });
  if (payload === undefined) fail('invalid_input');
  const data = immutable(payload);
  if (!ruleResult(synchronous(() => registration.validate.run(data)))) fail('invalid_input');
  return { registration, payload: data };
}
export function validateRegisteredNode(input: NodeInput): boolean {
  return preparedNode(input) !== undefined;
}
function valueAtPath(payload: JsonValue, path: string, limits: ContentLimits): JsonValue {
  if (path === '') return payload;
  const segments = path.split('.');
  if (segments.length > limits.maxRichTextDepth) fail('invalid_input');
  let current = payload;
  for (const segment of segments) {
    if (unsafeSegments.has(segment) || !/^(?:[a-zA-Z_][a-zA-Z0-9_-]*|0|[1-9][0-9]*)$/.test(segment))
      fail('invalid_input');
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/.test(segment)) fail('invalid_input');
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || !Object.hasOwn(current, index)) fail('invalid_input');
      current = current[index] ?? null;
    } else {
      if (!objectValue(current) || !Object.hasOwn(current, segment)) fail('invalid_input');
      const next = current[segment];
      if (next === undefined) fail('invalid_input');
      current = next;
    }
  }
  return current;
}
function reference(
  value: unknown,
  input: NodeInput & { payload: JsonValue; path: string; fieldId: string },
): ReferenceValue {
  if (!objectValue(value)) fail('invalid_input');
  exactKeys(value, ['collection', 'id', 'path', 'media']);
  const { collection, id, path, media } = value;
  if (
    typeof collection !== 'string' ||
    !collectionKey.test(collection) ||
    typeof id !== 'string' ||
    !identity.test(id) ||
    typeof path !== 'string' ||
    (media !== undefined && typeof media !== 'boolean')
  )
    fail('invalid_input');
  const target = valueAtPath(input.payload, path, input.limits);
  if (!objectValue(target)) fail('invalid_input');
  exactKeys(target, ['collection', 'id']);
  if (
    target['collection'] !== collection ||
    typeof target['id'] !== 'string' ||
    target['id'].toLowerCase() !== id.toLowerCase()
  )
    fail('invalid_input');
  return {
    collection,
    id: id.toLowerCase(),
    path: `${input.path}.payload${path ? `.${path}` : ''}`,
    fieldId: input.fieldId,
    onDelete: 'restrict',
    media: media === true,
  };
}
export function registeredNodeReferences(
  input: NodeInput & { path: string; fieldId: string },
): ReferenceValue[] {
  const prepared = preparedNode(input);
  if (!prepared?.registration.references) return [];
  const { payload } = prepared;
  const extractor = prepared.registration.references;
  const extracted = synchronous(() => extractor.run(payload));
  if (!Array.isArray(extracted)) fail('invalid_input');
  if (extracted.length > input.limits.maxRichTextNodes) fail('payload_too_large');
  const paths = new Set<string>();
  return extracted.map((value: unknown) => {
    const result = reference(value, { ...input, payload });
    if (paths.has(result.path)) fail('invalid_input');
    paths.add(result.path);
    return result;
  });
}
